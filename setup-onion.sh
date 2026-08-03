#!/usr/bin/env bash
#
# Mise en service du service onion Tor sur l'hôte de production, piloté par SSH.
#
# Usage :
#   ./setup-onion.sh <répertoire de clés>/<adresse>.onion
#
# L'argument est le répertoire produit par `mkp224o`, contenant
# hs_ed25519_secret_key, hs_ed25519_public_key et hostname.
#
# ⚠ PRÉREQUIS NON NÉGOCIABLE : la clé doit être sauvegardée hors de la machine
#   locale ET hors de l'hôte avant de lancer ce script. hs_ed25519_secret_key
#   *est* l'adresse : perdue, l'adresse l'est définitivement, et tout ce qui aura
#   été publié autour d'elle devient mort. Aucune redirection d'un onion à l'autre.
#
# Le script est idempotent : relancé, il remet la même configuration en place
# sans rien casser. Il ne touche au Caddyfile qu'après en avoir fait une copie
# horodatée, et ne recharge Caddy qu'après `caddy validate`.
#
# Variables : PROXIMA_HOST et PROXIMA_DOMAIN (requis), PROXIMA_USER, PROXIMA_KEY,
# PROXIMA_LEGACY_DOMAIN (optionnel) — définies dans `.deploy.env` (non versionné,
# chargé automatiquement ; modèle dans `.deploy.env.example`). Cf. deploy.sh.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
if [[ -f "$DIR/.deploy.env" ]]; then source "$DIR/.deploy.env"; fi

HOST="${PROXIMA_HOST:?PROXIMA_HOST est requis (hôte de production) — cf. .deploy.env.example}"
USER="${PROXIMA_USER:-ubuntu}"
KEY="${PROXIMA_KEY:-$HOME/.ssh/id_ed25519}"
DOMAIN="${PROXIMA_DOMAIN:?PROXIMA_DOMAIN est requis (domaine clearnet canonique)}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"
SCP="scp -i $KEY -o StrictHostKeyChecking=accept-new"

KEYDIR="${1:-}"
if [[ -z "$KEYDIR" ]]; then
  echo "✗ Usage : ./setup-onion.sh <répertoire de clés mkp224o>" >&2
  exit 1
fi
KEYDIR="${KEYDIR%/}"

for f in hs_ed25519_secret_key hs_ed25519_public_key hostname; do
  [[ -f "$KEYDIR/$f" ]] || { echo "✗ Fichier manquant : $KEYDIR/$f" >&2; exit 1; }
done

ONION="$(tr -d '[:space:]' < "$KEYDIR/hostname")"
[[ "$ONION" == *.onion ]] || { echo "✗ Adresse invalide dans hostname : '$ONION'" >&2; exit 1; }

echo "▶ Adresse onion : $ONION"
echo "▶ Cible         : ${USER}@${HOST}"
echo
read -r -p "La clé privée est-elle déjà sauvegardée hors de cette machine et hors de l'hôte ? [oui/non] " backed_up
[[ "$backed_up" == "oui" ]] || { echo "✗ Sauvegarde d'abord. C'est le seul secret irremplaçable de ce chantier." >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Tor depuis le dépôt torproject.org
#
# Le paquet Ubuntu 22.04 s'arrête à 0.4.6.10, or HiddenServicePoWDefensesEnabled
# — la défense anti-DoS la plus efficace, puisqu'elle impose un coût au client
# AVANT que le trafic n'atteigne l'application — exige Tor >= 0.4.8.
# ---------------------------------------------------------------------------
echo "▶ 1/6 — Installation de Tor (dépôt torproject.org, pour la preuve de travail)…"
$SSH "${USER}@${HOST}" 'bash -euo pipefail -s' <<'REMOTE'
if ! grep -rq "deb.torproject.org" /etc/apt/sources.list.d/ 2>/dev/null; then
  sudo apt-get install -y apt-transport-https gpg >/dev/null
  curl -fsSL https://deb.torproject.org/torproject.org/A3C4F0F979CAA22CDBA8F512EE8CBC9E886DDD89.asc \
    | sudo gpg --dearmor -o /usr/share/keyrings/deb.torproject.org-keyring.gpg
  CODENAME="$(lsb_release -cs)"
  ARCH="$(dpkg --print-architecture)"
  echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/deb.torproject.org-keyring.gpg] https://deb.torproject.org/torproject.org ${CODENAME} main" \
    | sudo tee /etc/apt/sources.list.d/tor.list >/dev/null
fi
sudo apt-get update -qq
sudo apt-get install -y tor deb.torproject.org-keyring >/dev/null
echo "   version installée : $(tor --version | head -1)"
REMOTE

# ---------------------------------------------------------------------------
# 2. Dépôt de la clé
#
# tor REFUSE de démarrer si les droits ou le propriétaire du répertoire sont
# faux — c'est voulu, et c'est le premier symptôme à vérifier dans journalctl.
# ---------------------------------------------------------------------------
echo "▶ 2/6 — Dépôt de la clé d'identité…"
$SSH "${USER}@${HOST}" 'sudo mkdir -p /var/lib/tor/proxima && sudo chmod 700 /var/lib/tor/proxima && rm -rf ~/.onion-stage && mkdir -p ~/.onion-stage && chmod 700 ~/.onion-stage'
$SCP -q "$KEYDIR/hs_ed25519_secret_key" "$KEYDIR/hs_ed25519_public_key" "$KEYDIR/hostname" "${USER}@${HOST}:~/.onion-stage/"
$SSH "${USER}@${HOST}" 'bash -euo pipefail -s' <<'REMOTE'
sudo cp ~/.onion-stage/hs_ed25519_secret_key ~/.onion-stage/hs_ed25519_public_key ~/.onion-stage/hostname /var/lib/tor/proxima/
sudo chown -R debian-tor:debian-tor /var/lib/tor/proxima
sudo chmod 700 /var/lib/tor/proxima
sudo chmod 600 /var/lib/tor/proxima/hs_ed25519_secret_key
# La copie de transit ne doit pas survivre : le home ubuntu est poussé par rsync.
shred -u ~/.onion-stage/* 2>/dev/null || rm -f ~/.onion-stage/*
rmdir ~/.onion-stage
REMOTE

# ---------------------------------------------------------------------------
# 3. torrc
# ---------------------------------------------------------------------------
echo "▶ 3/6 — Configuration de tor…"
$SSH "${USER}@${HOST}" 'bash -euo pipefail -s' <<'REMOTE'
sudo cp /etc/tor/torrc "/etc/tor/torrc.bak-$(date +%Y%m%d-%H%M%S)"
# Bloc délimité : relancer le script le remplace au lieu de l'empiler.
sudo sed -i '/# >>> proxima onion/,/# <<< proxima onion/d' /etc/tor/torrc
sudo tee -a /etc/tor/torrc >/dev/null <<'CONF'
# >>> proxima onion (design 2026-07-29) — ne pas éditer à la main, géré par setup-onion.sh
HiddenServiceDir /var/lib/tor/proxima/
HiddenServicePort 80 127.0.0.1:8080

# Défenses anti-DoS à l'ENTRÉE du service : imposent un coût au client sous
# pression, avant que le trafic n'atteigne l'application. C'est la couche la plus
# efficace contre le DoS onion — les seaux applicatifs ne sont que le second filet.
HiddenServicePoWDefensesEnabled 1
HiddenServiceEnableIntroDoSDefense 1

# Aucun besoin du proxy SOCKS sortant : réduit la surface d'attaque du démon.
SocksPort 0
# <<< proxima onion
CONF
sudo systemctl restart tor
sleep 3
systemctl is-active tor >/dev/null || { echo "✗ tor n'a pas démarré :"; sudo journalctl -u tor -n 20 --no-pager; exit 1; }
REMOTE

# Vérifie que tor a bien ADOPTÉ l'identité déposée plutôt que d'en fabriquer une.
# `sudo cat | tr` et non `sudo tr < fichier` : la redirection est faite par le
# shell appelant, non privilégié, qui ne peut pas lire un répertoire en 700.
ADOPTED="$($SSH "${USER}@${HOST}" 'sudo cat /var/lib/tor/proxima/hostname' | tr -d '[:space:]')"
if [[ "$ADOPTED" != "$ONION" ]]; then
  echo "✗ tor a généré une AUTRE adresse : $ADOPTED (attendu : $ONION)" >&2
  echo "  La clé n'a pas été reprise. Ne rien publier avant d'avoir corrigé." >&2
  exit 1
fi
echo "   identité adoptée : $ADOPTED ✓"

# ---------------------------------------------------------------------------
# 4. Caddy — bloc onion + retrait du marqueur côté clearnet
#
# LA LIGNE QUI COMPTE LE PLUS : `header_up -X-Proxima-Onion` dans le bloc
# clearnet. Sans elle, n'importe quel visiteur d'Internet basculerait sur le
# régime onion en forgeant l'en-tête, et échapperait à la limitation par IP.
# (security.isOnionRequest double la garantie côté Node en exigeant une origine
# loopback — mais on ne s'appuie pas sur un seul rempart.)
# ---------------------------------------------------------------------------
echo "▶ 4/6 — Blocs Caddy…"
$SSH "${USER}@${HOST}" "bash -euo pipefail -s '$ONION' '$DOMAIN' '${PROXIMA_LEGACY_DOMAIN:-}'" <<'REMOTE'
ONION="$1"
DOMAIN="$2"
LEGACY="$3"
sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CONF
# Domaine canonique.
${DOMAIN} {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000 {
		# Retrait INCONDITIONNEL du marqueur onion. Sans cette ligne, tout
		# visiteur du clearnet contournerait l'anti-spam en forgeant l'en-tête.
		header_up -X-Proxima-Onion
	}
}

# www → apex : une seule URL indexable, conforme au <link rel="canonical">.
www.${DOMAIN} {
	redir https://${DOMAIN}{uri} permanent
}

# Service onion. \`http://\` désactive l'HTTPS automatique :
# aucun certificat ACME n'est possible ni utile, Tor chiffrant déjà le circuit.
# \`bind 127.0.0.1\` rend le port injoignable de l'extérieur — c'est ce qui rend
# le marqueur non forgeable.
http://${ONION}:8080 {
	bind 127.0.0.1
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000 {
		# PAS de \`header_up -X-Proxima-Onion\` ici : Caddy applique les
		# SUPPRESSIONS APRÈS les affectations, quel que soit leur ordre dans le
		# fichier. La suppression effacerait donc le marqueur qu'on vient de
		# poser, et le service onion serait traité comme du clearnet.
		# Elle serait de toute façon superflue : \`Set\` écrase déjà la valeur
		# éventuellement envoyée par le client.
		header_up X-Proxima-Onion 1
	}
}
CONF

# Ancien domaine, optionnel (PROXIMA_LEGACY_DOMAIN) : redirection permanente qui
# préserve le référencement acquis avant la bascule.
if [ -n "$LEGACY" ]; then
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<CONF

${LEGACY} {
	redir https://${DOMAIN}{uri} permanent
}
CONF
fi

sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
REMOTE

# ---------------------------------------------------------------------------
# 5. ONION_HOST dans /etc/proxima.env (hors /opt/proxima, que deploy.sh écrase)
# ---------------------------------------------------------------------------
echo "▶ 5/6 — Variable d'environnement…"
$SSH "${USER}@${HOST}" "bash -euo pipefail -s '$ONION'" <<'REMOTE'
ONION="$1"
sudo sed -i '/^ONION_HOST=/d' /etc/proxima.env
echo "ONION_HOST=${ONION}" | sudo tee -a /etc/proxima.env >/dev/null
sudo systemctl restart proxima
sleep 2
systemctl is-active proxima >/dev/null || { echo "✗ proxima n'a pas redémarré :"; sudo journalctl -u proxima -n 20 --no-pager; exit 1; }
REMOTE

# ---------------------------------------------------------------------------
# 6. Vérifications
# ---------------------------------------------------------------------------
echo "▶ 6/6 — Vérifications…"
echo -n "   Onion-Location sur le clearnet : "
curl -sI "https://${DOMAIN}/" | grep -i "^onion-location:" || echo "✗ ABSENT (le front est-il buildé avec la nouvelle version ?)"

echo -n "   marqueur forgé depuis le clearnet : "
if curl -sI -H 'X-Proxima-Onion: 1' "https://${DOMAIN}/" | grep -qi "^strict-transport-security:"; then
  echo "sans effet ✓ (HSTS toujours émis)"
else
  echo "✗ EFFET DÉTECTÉ — le retrait du marqueur ne fonctionne pas !"
fi

echo -n "   sonde « loopback non marqué » : "
$SSH "${USER}@${HOST}" 'sudo journalctl -u proxima -n 200 --no-pager | grep -c "connexion en loopback SANS le marqueur" || true' \
  | { read -r n; [[ "$n" == "0" ]] && echo "aucune ✓" || echo "⚠ $n occurrence(s) — le bloc Caddy onion ne s'applique pas"; }

echo
echo "✅ Service onion en place : http://${ONION}/"
echo
echo "Reste à faire À LA MAIN :"
echo "  • tester depuis Tor Browser aux TROIS niveaux de sécurité ;"
echo "  • en « Safer », chronométrer l'entrée dans un salon chiffré (Argon2id sans JIT) ;"
echo "  • vérifier que le badge « Via Tor » est ABSENT depuis le clearnet ;"
echo "  • soumettre l'adresse à https://ahmia.fi/add/ — après validation seulement."

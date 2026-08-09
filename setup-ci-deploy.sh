#!/usr/bin/env bash
#
# Prépare une machine hôte à recevoir le déploiement continu de GitHub Actions.
# À lancer une seule fois, sur l'hôte, depuis un compte disposant de sudo.
#
# Usage :
#   ./setup-ci-deploy.sh 'ssh-ed25519 AAAA… github-actions@proxima'
#
# Le script installe trois cloisons, et c'est tout son objet :
#
#   1. `proxima` — le compte qui exécute le service. Sans sudo, sans shell.
#      Auparavant le service tournait sous `ubuntu`, qui a sudo NOPASSWD complet :
#      quiconque poussait du code obtenait donc root. Déployer, c'est faire
#      exécuter du code par le compte de service — la seule protection réelle est
#      que ce compte-là ne puisse rien faire d'autre.
#   2. `deploy` — le compte que la CI utilise en SSH. Il écrit l'arborescence et
#      ne peut, via sudo, que relancer et interroger l'unité.
#   3. le compte administrateur — l'humain. Ses clés sont recopiées sur `deploy`
#      pour que `deploy.sh` depuis le poste de travail passe par le même compte
#      que la CI : un seul propriétaire de l'arborescence, donc aucune bagarre de
#      permissions entre les deux chemins de déploiement.
#
# Le script est idempotent : le relancer ne change rien.

set -euo pipefail

PUBKEY="${1:?Clé publique de la CI attendue en argument (contenu du .pub)}"
APP_PATH="${PROXIMA_PATH:-/opt/proxima}"
SERVICE="${PROXIMA_SERVICE:-proxima}"

[[ -d "$APP_PATH" ]] || { echo "✗ $APP_PATH est introuvable" >&2; exit 1; }

echo "▶ 1/6 — Compte de service non privilégié (proxima)…"
getent group proxima >/dev/null || sudo groupadd --system proxima
id proxima >/dev/null 2>&1 || sudo useradd --system --gid proxima \
  --no-create-home --shell /usr/sbin/nologin proxima

echo "▶ 2/6 — Compte de déploiement (deploy)…"
getent group deploy >/dev/null || sudo groupadd deploy
id deploy >/dev/null 2>&1 || sudo useradd --create-home --gid deploy \
  --shell /bin/bash deploy
# L'administrateur garde la main en écriture sur l'arborescence.
sudo usermod -aG deploy "$(id -un)"

echo "▶ 3/6 — Clés autorisées sur le compte deploy…"
# `restrict` coupe tout ce dont un déploiement n'a pas besoin : tty, redirection
# de port, agent, X11. Il reste l'exécution de commandes, qui est le sujet.
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
{
  printf 'restrict %s\n' "$PUBKEY"
  # Les clés de l'administrateur qui lance ce script : elles ouvrent déjà un
  # compte à sudo complet, les recopier ici n'élargit rien et donne au poste de
  # travail le même chemin de déploiement que la CI.
  [[ -f "$HOME/.ssh/authorized_keys" ]] &&
    sed -e '/^\s*$/d' -e '/^#/d' -e 's/^/restrict /' "$HOME/.ssh/authorized_keys"
} | sudo tee /home/deploy/.ssh/authorized_keys >/dev/null
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys

echo "▶ 4/6 — sudo restreint au redémarrage du service…"
sudo tee /etc/sudoers.d/proxima-deploy >/dev/null <<EOF
# Le compte de déploiement continu ne peut que relancer et interroger l'unité.
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${SERVICE}, /usr/bin/systemctl restart ${SERVICE}.service, /usr/bin/systemctl is-active ${SERVICE}, /usr/bin/systemctl is-active ${SERVICE}.service
EOF
sudo chmod 440 /etc/sudoers.d/proxima-deploy
sudo visudo -cf /etc/sudoers.d/proxima-deploy

echo "▶ 5/6 — Droits sur ${APP_PATH}…"
# Écrit par le seul `deploy`, lu par tous — donc par `proxima`, qui exécute le
# service et n'a besoin de rien d'autre. Le setgid maintient le groupe sur les
# fichiers créés ensuite, y compris ceux que npm dépose dans node_modules.
sudo chown -R deploy:deploy "$APP_PATH"
sudo chmod -R g+rwX,o+rX "$APP_PATH"
sudo find "$APP_PATH" -type d -exec chmod g+s {} +
# Le `.env` de l'arborescence est inutilisé en production (systemd lit
# /etc/proxima.env, root-only) : on le met hors de portée du compte de
# déploiement plutôt que de le laisser suivre les droits du reste.
if [[ -f "$APP_PATH/.env" ]]; then
  sudo chown root:root "$APP_PATH/.env"
  sudo chmod 600 "$APP_PATH/.env"
fi

echo "▶ 6/6 — Bascule du service sous le compte proxima…"
# Un fragment plutôt qu'une modification de l'unité : réversible en supprimant
# le fichier, et l'unité d'origine reste lisible telle qu'elle a été écrite.
sudo mkdir -p "/etc/systemd/system/${SERVICE}.service.d"
sudo tee "/etc/systemd/system/${SERVICE}.service.d/10-user.conf" >/dev/null <<'EOF'
[Service]
User=proxima
Group=proxima
EOF
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE"
sleep 2
sudo systemctl is-active "$SERVICE"

echo "✅ Hôte prêt. La CI peut se connecter en deploy@ avec la clé fournie."

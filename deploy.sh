#!/usr/bin/env bash
#
# Déploiement de Proxima sur une machine hôte, par rsync + SSH : envoi de la copie
# de travail, installation des dépendances, build du frontend, redémarrage du
# service systemd.
#
# Usage :
#   ./deploy.sh                # déploie (build front inclus)
#   ./deploy.sh --no-build     # pousse le code + restart sans rebuilder le front
#
# Variables d'environnement — définies dans `.deploy.env` (non versionné, chargé
# automatiquement ; modèle dans `.deploy.env.example`) ou exportées à la main :
#   PROXIMA_HOST   (requis)    hôte cible
#   PROXIMA_USER   (défaut: ubuntu)
#   PROXIMA_KEY    (défaut: ~/.ssh/id_ed25519)
#   PROXIMA_PATH   (défaut: /opt/proxima)
#   PROXIMA_URL    (requis)    URL publique, cible du curl de santé

set -euo pipefail

# Racine du projet = dossier de ce script (fonctionne quel que soit le cwd).
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/"

# shellcheck source=/dev/null
if [[ -f "${SRC}.deploy.env" ]]; then source "${SRC}.deploy.env"; fi

HOST="${PROXIMA_HOST:?PROXIMA_HOST est requis (hôte de déploiement) — cf. .deploy.env.example}"
USER="${PROXIMA_USER:-ubuntu}"
KEY="${PROXIMA_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_PATH="${PROXIMA_PATH:-/opt/proxima}"
URL="${PROXIMA_URL:?PROXIMA_URL est requis (URL publique pour le contrôle de santé)}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

BUILD_FRONT=1
[[ "${1:-}" == "--no-build" ]] && BUILD_FRONT=0

echo "▶ Cible : ${USER}@${HOST}:${REMOTE_PATH}"

echo "▶ 1/3 — Envoi du code (rsync)…"
# `--exclude '.env'` : sans lui, `--delete` supprime le `.env` distant quand la
# machine locale n'en a pas, et l'écrase par la copie locale quand elle en a un.
# Les secrets de production vivent dans l'unité systemd, mais la protection reste
# nécessaire — rsync ne lit pas `.gitignore`.
rsync -az --delete -e "$SSH" \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.deploy.env' \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  "$SRC" "${USER}@${HOST}:${REMOTE_PATH}/"

echo "▶ 2/3 — Dépendances + build sur la VM…"
# shellcheck disable=SC2087
$SSH "${USER}@${HOST}" bash -s <<REMOTE
set -e
cd "${REMOTE_PATH}"
npm install --omit=dev
if [ "${BUILD_FRONT}" = "1" ]; then
  npm install --prefix frontend --include=dev
  npm run build --prefix frontend
else
  echo "(build front sauté : --no-build)"
fi
REMOTE

echo "▶ 3/3 — Redémarrage du service…"
$SSH "${USER}@${HOST}" 'sudo systemctl restart proxima && sleep 2 && systemctl is-active proxima'

echo "▶ Vérif santé :"
curl -s -m 15 "$URL/api/health" && echo
echo "✅ Déploiement terminé → $URL"

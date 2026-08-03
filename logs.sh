#!/usr/bin/env bash
#
# Consultation des logs de l'hôte de production, par SSH.
#
# Usage :
#   ./logs.sh                 # logs de l'app en direct (suivi live, Ctrl-C pour quitter)
#   ./logs.sh app             # idem (explicite)
#   ./logs.sh caddy           # logs du reverse-proxy / TLS en direct
#   ./logs.sh redis           # logs de Redis en direct
#   ./logs.sh tor             # logs du démon tor (service onion) en direct
#   ./logs.sh all             # les 4 services mélangés, en direct
#   ./logs.sh errors          # dernières erreurs de l'app (100 lignes, pas de suivi)
#   ./logs.sh app 500         # 500 dernières lignes de l'app puis suivi live
#
# Variables : PROXIMA_HOST, PROXIMA_USER, PROXIMA_KEY — définies dans `.deploy.env`
# (non versionné, chargé automatiquement) ou exportées à la main. Cf. deploy.sh.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
if [[ -f "$DIR/.deploy.env" ]]; then source "$DIR/.deploy.env"; fi

HOST="${PROXIMA_HOST:?PROXIMA_HOST est requis (hôte de production) — cf. .deploy.env.example}"
USER="${PROXIMA_USER:-ubuntu}"
KEY="${PROXIMA_KEY:-$HOME/.ssh/id_ed25519}"

TARGET="${1:-app}"
LINES="${2:-80}"

# ssh -t : alloue un terminal pour que Ctrl-C et l'affichage live marchent bien.
run() { ssh -t -i "$KEY" -o StrictHostKeyChecking=accept-new "${USER}@${HOST}" "$*"; }

case "$TARGET" in
  app|proxima)
    echo "▶ Logs APP (proxima) — Ctrl-C pour quitter"
    run "sudo journalctl -u proxima -n ${LINES} -f --no-hostname" ;;
  caddy)
    echo "▶ Logs CADDY (proxy/TLS) — Ctrl-C pour quitter"
    run "sudo journalctl -u caddy -n ${LINES} -f --no-hostname" ;;
  redis)
    echo "▶ Logs REDIS — Ctrl-C pour quitter"
    run "sudo journalctl -u redis-server -n ${LINES} -f --no-hostname" ;;
  tor)
    # Le démon refuse de démarrer si /var/lib/tor/proxima n'est pas en 700 et
    # propriété de debian-tor : c'est le premier symptôme à chercher ici.
    echo "▶ Logs TOR (service onion) — Ctrl-C pour quitter"
    run "sudo journalctl -u tor@default -u tor -n ${LINES} -f --no-hostname" ;;
  all)
    echo "▶ Logs des 4 services (app + caddy + redis + tor) — Ctrl-C pour quitter"
    run "sudo journalctl -u proxima -u caddy -u redis-server -u tor@default -n ${LINES} -f --no-hostname" ;;
  errors|err)
    echo "▶ Dernières erreurs de l'app :"
    run "sudo journalctl -u proxima -n 200 --no-hostname --no-pager | grep -iE 'error|err |warn|unknown|exception|fail' || echo '(aucune erreur récente)'" ;;
  *)
    echo "Cible inconnue : '$TARGET'. Utilise : app | caddy | redis | tor | all | errors"
    exit 1 ;;
esac

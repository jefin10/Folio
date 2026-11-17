#!/usr/bin/env bash
# Deploy helper, run from the dev PC. Builds happen on the server.
#   deploy/folio.sh init      first-time: sync, secrets, tunnel
#   deploy/folio.sh up        sync code, build the site on the server, start/refresh everything
#   deploy/folio.sh check     disposable copy of the stack on 127.0.0.1:18090 (no tunnel) for tests
#   deploy/folio.sh check-down  remove that copy and its volume
#   deploy/folio.sh status    containers + health
#   deploy/folio.sh logs [svc]
#   deploy/folio.sh backup    take a backup now
#   deploy/folio.sh anon-key  print the public anon key (for the Android app)
#   deploy/folio.sh passphrase  set the device passphrase (creates the owner the first time)
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER=${FOLIO_SERVER:-ec2-user@203.0.113.10}
KEY=${FOLIO_SSH_KEY:-$HOME/.ssh/folio.pem}
HOST=${FOLIO_HOST:-folio.example.com}
REMOTE=folio
SSH=(ssh -i "$KEY" -o ConnectTimeout=20 "$SERVER")

sync() {
  rsync -az --delete -e "ssh -i $KEY" \
    --exclude node_modules --exclude .next --exclude .expo --exclude .git --exclude '*.log' \
    --exclude apps/mobile/android --exclude apps/mobile/ios --exclude apps/wear/build --exclude apps/wear/app/build --exclude apps/wear/.gradle \
    --exclude deploy/.env --exclude deploy/tunnel --exclude deploy/backups --exclude 'apps/web/.env*' \
    ./ "$SERVER:$REMOTE/"
}

case "${1:-}" in
  init)
    sync
    "${SSH[@]}" "cd $REMOTE/deploy && bash server-init.sh $HOST"
    ;;
  up)
    sync
    "${SSH[@]}" "cd $REMOTE/deploy && docker compose build gateway && docker compose up -d --remove-orphans && docker compose up -d --force-recreate --no-deps migrate && docker compose wait migrate; docker compose logs --no-log-prefix migrate | tail -12; docker image prune -f >/dev/null"
    ;;
  check)
    sync
    "${SSH[@]}" "cd $REMOTE/deploy && sed -e 's/^FOLIO_SINGLE_OWNER=.*/FOLIO_SINGLE_OWNER=off/' -e '/^COMPOSE_PROFILES=/d' .env > .env.check && echo GATEWAY_PORT=18090 >> .env.check && chmod 600 .env.check && docker compose -p folio-check --env-file .env.check build gateway && docker compose -p folio-check --env-file .env.check up -d && docker compose -p folio-check --env-file .env.check wait migrate; docker compose -p folio-check --env-file .env.check logs --no-log-prefix migrate | tail -12"
    ;;
  check-down)
    "${SSH[@]}" "cd $REMOTE/deploy && docker compose -p folio-check --env-file .env.check down -v --remove-orphans && rm -f .env.check"
    ;;
  status)
    "${SSH[@]}" "cd $REMOTE/deploy && docker compose ps -a --format 'table {{.Service}}\t{{.Status}}'"
    ;;
  logs)
    "${SSH[@]}" "cd $REMOTE/deploy && docker compose logs --tail=80 ${2:-}"
    ;;
  backup)
    "${SSH[@]}" "cd $REMOTE/deploy && docker compose exec -T backup bash -c 'export PGPASSWORD=\$POSTGRES_PASSWORD; pg_dump -h db -U postgres -d postgres -Fc -f /backups/folio-manual-\$(date -u +%Y%m%d-%H%M%S).dump' && ls -lh backups | tail -3"
    ;;
  passphrase)
    if [ -t 0 ]; then read -rsp "New Folio passphrase: " P; echo; else P=$(cat); fi
    [ ${#P} -ge 8 ] || { echo "Use at least 8 characters."; exit 1; }
    printf '%s' "$P" | "${SSH[@]}" "cd $REMOTE/deploy && set -a && . ./.env && set +a && python3 set-passphrase.py"
    ;;
  anon-key)
    "${SSH[@]}" "grep '^ANON_KEY=' $REMOTE/deploy/.env | cut -d= -f2-"
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 1
    ;;
esac

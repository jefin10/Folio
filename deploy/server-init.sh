#!/usr/bin/env bash
# Run ON THE SERVER, once, from ~/folio/deploy. Generates every secret into
# .env (mode 600) without printing it. If the machine runs cloudflared as a
# system service, it also adds an ingress rule and DNS record for the
# hostname; otherwise point your own HTTPS reverse proxy at the gateway.
#   bash server-init.sh <public-hostname>     e.g. folio.example.com
set -euo pipefail
cd "$(dirname "$0")"
HOST=${1:?usage: server-init.sh <public-hostname>}
PORT=${GATEWAY_PORT:-18080}
CF=/etc/cloudflared/config.yml
umask 077

if [ ! -f .env ]; then
  gen() { openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
  b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  JWT_SECRET=$(gen 64)
  now=$(date +%s)
  exp=$((now + 10 * 365 * 24 * 3600))
  jwt() {
    local header payload sig
    header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
    payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" "$exp" | b64url)
    sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
    printf '%s.%s.%s' "$header" "$payload" "$sig"
  }
  {
    echo "SITE_URL=https://$HOST"
    echo "POSTGRES_PASSWORD=$(gen 40)"
    echo "JWT_SECRET=$JWT_SECRET"
    echo "ANON_KEY=$(jwt anon)"
    echo "SERVICE_ROLE_KEY=$(jwt service_role)"
    echo "SECRET_KEY_BASE=$(gen 64)"
    echo "FOLIO_SINGLE_OWNER=on"
    echo "DISABLE_SIGNUP=true"
  } > .env
  chmod 600 .env
  echo "✓ .env created with fresh secrets (not shown)"
else
  echo "· .env exists — keeping existing secrets"
fi
mkdir -p backups

# Public path. The gateway listens on 127.0.0.1:$PORT only; nothing is
# exposed directly.
if ! sudo test -f "$CF"; then
  echo "· no $CF on this machine: publish https://$HOST yourself by proxying it to http://127.0.0.1:$PORT"
  echo "  (Cloudflare Tunnel, Caddy, nginx… anything that terminates HTTPS)."
elif sudo grep -q "hostname: $HOST\$" "$CF"; then
  echo "· $HOST already routed in $CF"
else
  tunnel=$(sudo awk '/^tunnel:/{print $2}' "$CF")
  sudo cp "$CF" "$CF.bak-$(date +%Y%m%d%H%M%S)"
  sudo python3 - "$CF" "$HOST" "$PORT" <<'PY'
import sys
path, host, port = sys.argv[1:]
lines = open(path).read().splitlines()
catch = next(i for i, l in enumerate(lines) if l.strip().startswith('- service: http_status'))
lines[catch:catch] = [f'  - hostname: {host}', f'    service: http://127.0.0.1:{port}']
open(path, 'w').write('\n'.join(lines) + '\n')
PY
  sudo cloudflared tunnel --config "$CF" ingress validate
  sudo systemctl restart cloudflared
  cloudflared tunnel route dns "$tunnel" "$HOST"
  echo "✓ $HOST → tunnel $tunnel → 127.0.0.1:$PORT"
fi

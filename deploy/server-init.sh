#!/usr/bin/env bash
# Run ON THE SERVER, once, from ~/folio/deploy. Generates every secret into
# .env (mode 600) without printing it, and creates the Cloudflare tunnel.
#   bash server-init.sh <public-hostname>     e.g. folio.example.com
set -euo pipefail
cd "$(dirname "$0")"
HOST=${1:?usage: server-init.sh <public-hostname>}
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
    echo "REALTIME_ENC_KEY=$(gen 16)"
    echo "FOLIO_SINGLE_OWNER=on"
    echo "COMPOSE_PROFILES=tunnel"
    echo "DISABLE_SIGNUP=true"
  } > .env
  chmod 600 .env
  echo "✓ .env created with fresh secrets (not shown)"
else
  echo "· .env exists — keeping existing secrets"
fi

mkdir -p tunnel backups
if [ ! -f tunnel/creds.json ]; then
  if ! cloudflared tunnel info folio >/dev/null 2>&1; then
    cloudflared tunnel create folio
  fi
  id=$(cloudflared tunnel list -o json | python3 -c 'import json,sys; print(next(t["id"] for t in json.load(sys.stdin) if t["name"]=="folio"))')
  cp "$HOME/.cloudflared/$id.json" tunnel/creds.json
  chmod 600 tunnel/creds.json
  cat > tunnel/config.yml <<CFG
tunnel: $id
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: $HOST
    service: http://gateway:80
  - service: http_status:404
CFG
  cloudflared tunnel route dns folio "$HOST"
  echo "✓ tunnel folio → $HOST"
else
  echo "· tunnel config exists"
fi

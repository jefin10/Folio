# Folio gateway image: Caddy + the static website, ~50 MB.
# apps/web/out is built on the dev PC by deploy/folio.sh (memory-capped),
# so the server only copies files — no Node, no build tools.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY apps/web/out /srv

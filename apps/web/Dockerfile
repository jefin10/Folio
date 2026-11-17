# Folio gateway image: the static website + the Caddy front door, in one
# ~50 MB container. Built on the server (never on the dev PC).
FROM node:24-alpine AS build
RUN npm i -g pnpm@12.18.0
WORKDIR /repo
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter "@folio/web..." \
 && pnpm --filter @folio/web build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/out /srv

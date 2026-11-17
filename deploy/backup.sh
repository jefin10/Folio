#!/usr/bin/env bash
# Nightly logical backup of the Folio database into ./backups on the host.
set -uo pipefail
export PGPASSWORD="$POSTGRES_PASSWORD"
KEEP=${KEEP:-14}
while true; do
  stamp=$(date -u +%Y%m%d-%H%M%S)
  if pg_dump -h db -U postgres -d postgres -Fc --schema=public --schema=auth --schema=private -f "/backups/folio-$stamp.dump.part"; then
    mv "/backups/folio-$stamp.dump.part" "/backups/folio-$stamp.dump"
    echo "backup folio-$stamp.dump"
    ls -1t /backups/folio-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
  else
    rm -f "/backups/folio-$stamp.dump.part"
    echo "backup failed" >&2
  fi
  sleep 86400
done

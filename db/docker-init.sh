#!/bin/bash
# Runs once, on the first start of the docker volume (see docker-compose.yml)
set -euo pipefail
for f in 01_schema.sql 02_functions_triggers.sql 03_views.sql 04_roles.sql 05_alter_migration.sql 06_seed.sql; do
  echo "== $f"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -f "/hms-db/$f"
done
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -v pw="$HMS_APP_PASSWORD" <<'SQL'
ALTER ROLE hms_app PASSWORD :'pw';
ALTER ROLE hms_app SET search_path = hms, public;
ALTER DATABASE hms SET timezone TO 'Asia/Kolkata';
SQL
echo "== CareFlow database ready"

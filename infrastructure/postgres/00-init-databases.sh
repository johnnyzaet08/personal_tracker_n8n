#!/bin/sh
set -eu

case "$TRACKER_DB:$TRACKER_DB_USER:$N8N_DB:$N8N_DB_USER" in
  *[!a-zA-Z0-9_:]*) echo "Database and role names may contain only letters, digits, and underscores." >&2; exit 1 ;;
esac

psql --username "$POSTGRES_USER" --dbname postgres \
  --set=tracker_db="$TRACKER_DB" \
  --set=tracker_user="$TRACKER_DB_USER" \
  --set=tracker_password="$TRACKER_DB_PASSWORD" \
  --set=n8n_db="$N8N_DB" \
  --set=n8n_user="$N8N_DB_USER" \
  --set=n8n_password="$N8N_DB_PASSWORD" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'tracker_user', :'tracker_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'tracker_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'tracker_user', :'tracker_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'n8n_user', :'n8n_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'n8n_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'n8n_user', :'n8n_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'tracker_db', :'tracker_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'tracker_db') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'n8n_db', :'n8n_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'n8n_db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'tracker_db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'n8n_db') \gexec
EOSQL

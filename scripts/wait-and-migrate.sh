#!/bin/sh
set -e

# In selfhost mode SUPABASE_DB_URL targets 127.0.0.1 (the db container published
# on loopback). Wait until a real authenticated connection succeeds before running
# migrations. pg_isready is not sufficient — postgres starts accepting TCP
# connections before its init scripts finish setting up roles and passwords,
# causing supabase CLI to get a "connection reset by peer".
if echo "${SUPABASE_DB_URL:-}" | grep -q '127\.0\.0\.1'; then
  echo "[migrate] Waiting for local DB to accept connections..."
  _tries=0
  until psql "${SUPABASE_DB_URL}" -c "SELECT 1" >/dev/null 2>&1; do
    _tries=$((_tries + 1))
    if [ "$_tries" -ge 30 ]; then
      echo "[migrate] ERROR: local DB not accepting connections after 1 minute." >&2
      echo "[migrate] Hint: check 'docker compose --profile selfhost logs db'." >&2
      echo "[migrate] Common causes:" >&2
      echo "[migrate]   1. Port('${DB_PORT:-54332}') not published — recreate the db:" >&2
      echo "[migrate]      docker compose --profile selfhost up -d --force-recreate db" >&2
      echo "[migrate]   2. Port clash with a local 'supabase start' stack — set a free" >&2
      echo "[migrate]      port in DB_PORT and SUPABASE_DB_URL (.env)." >&2
      echo "[migrate]   3. Failed first-boot init leaves a half-initialized data dir —" >&2
      echo "[migrate]      wipe the pgdata volume and retry." >&2
      exit 1
    fi
    sleep 2
  done
  echo "[migrate] DB ready."
fi

exec supabase "$@"

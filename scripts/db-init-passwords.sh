#!/bin/bash
# Sets passwords on roles created by supabase/postgres init scripts without passwords.
# Runs as a postgres initdb script (after migrate.sh — hence z- prefix).
# Only executes on first container start (empty data directory).
#
# Must run as supabase_admin (superuser) because postgres is demoted to NOSUPERUSER
# by 10000000000000_demote-postgres.sql before this script runs.
set -e

# Guard: reject passwords that would break SQL quoting or the GoTrue/PostgREST
# connection URLs (built from DB_PASSWORD via compose interpolation). Hex-only
# secrets (see .env.selfhost.example: openssl rand -hex) always pass.
case "${POSTGRES_PASSWORD}" in
  *[!A-Za-z0-9_-]*)
    echo "ERROR: DB_PASSWORD must contain only letters, digits, '-' or '_'." >&2
    echo "       Other characters can break this init script and the auth/API connection URLs." >&2
    echo "       Fix DB_PASSWORD in .env, wipe the pgdata volume, and start again." >&2
    exit 1 ;;
esac

psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U supabase_admin postgres <<SQL
ALTER ROLE authenticator           WITH PASSWORD '${POSTGRES_PASSWORD}';
ALTER ROLE supabase_auth_admin     WITH PASSWORD '${POSTGRES_PASSWORD}';
ALTER ROLE supabase_read_only_user WITH PASSWORD '${POSTGRES_PASSWORD}';
SQL

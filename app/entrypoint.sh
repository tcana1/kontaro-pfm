#!/bin/sh
set -e

# Selfhost mode: derive ANON_KEY from JWT_SECRET (HS256, fixed claims, iat=0 so
# the key is stable across restarts and copies don't silently break).
if [ -z "${SUPABASE_ANON_KEY:-}" ] && [ -n "${SUPABASE_JWT_SECRET:-}" ]; then
  _b64u() { base64 | tr -d '\n=' | tr '+/' '-_'; }
  _hdr=$(printf '{"alg":"HS256","typ":"JWT"}' | _b64u)
  _pay=$(printf '{"role":"anon","iss":"supabase","iat":0,"exp":2000000000}' | _b64u)
  _sig=$(printf '%s.%s' "$_hdr" "$_pay" | openssl dgst -binary -sha256 -hmac "$SUPABASE_JWT_SECRET" | _b64u)
  SUPABASE_ANON_KEY="${_hdr}.${_pay}.${_sig}"
fi

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required (or set SUPABASE_JWT_SECRET for selfhost)}"

OAUTH_ENABLED="${OAUTH_ENABLED:-true}"
POSTGREST_URL="${POSTGREST_URL:-http://postgrest:3000}"
GOTRUE_URL="${GOTRUE_URL:-http://gotrue:8081}"

# config.js is a static file served without auth, so everything substituted here is public.
# AUTO_LOGIN_PASSWORD included: enabling auto-login publishes that password to any client
# that can reach the app. See SECURITY.md.
if [ -n "${AUTO_LOGIN_PASSWORD:-}" ]; then
  echo "WARNING: auto-login is enabled; AUTO_LOGIN_PASSWORD will be readable at GET /config.js" >&2
fi

envsubst '${SUPABASE_URL} ${SUPABASE_ANON_KEY} ${OAUTH_ENABLED} ${AUTO_LOGIN_EMAIL} ${AUTO_LOGIN_PASSWORD}' \
  < /etc/nginx/templates/config.js.template \
  > /usr/share/nginx/html/config.js

envsubst '${POSTGREST_URL} ${GOTRUE_URL}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'

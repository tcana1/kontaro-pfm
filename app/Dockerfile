# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Supabase URL and key are injected at runtime via /config.js — no build args needed.
# VITE_IMPORTER_URL is not needed either: nginx proxies /api/ → importer internally.
RUN npm run build

# ── Serve stage ────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY --from=builder /app/dist/public /usr/share/nginx/html

# Both templates are processed by entrypoint.sh at startup:
#   config.js.template   → /usr/share/nginx/html/config.js  (runtime config for browser)
#   default.conf.template → /etc/nginx/conf.d/default.conf  (nginx routing)
# A custom entrypoint is needed because the built-in envsubst mechanism only
# supports a single output directory.
COPY config.js.template      /etc/nginx/templates/config.js.template
COPY default.conf.template   /etc/nginx/templates/default.conf.template
COPY entrypoint.sh           /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ || exit 1
ENTRYPOINT ["/entrypoint.sh"]

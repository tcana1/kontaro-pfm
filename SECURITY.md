# Security Policy

## Supported Versions

This project is in active development. Security fixes are applied to the latest version only.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Open a [GitHub Security Advisory](https://github.com/tcana1/kontaro-pfm/security/advisories/new) on this repository. Please do not use regular issues for vulnerability reports.

## Threat Model

PFM is designed as a **single-user self-hosted application**. The threat model assumes:

- The operator controls the server and database.
- All users authenticated via Supabase Auth are the same person (the owner).

Multi-user deployments (multiple Supabase accounts on the same instance) are **not tested or supported**. Row-Level Security policies isolate data per `auth.uid()`, but this configuration has not undergone a multi-tenant security audit.

## Secrets Management

| Secret | Where | Notes |
|---|---|---|
| `SECRETS_ENC_KEY` | Importer `.env` | Fernet key; losing it makes all encrypted DB secrets irrecoverable. Back up separately from the DB. |
| `SUPABASE_ANON_KEY` | Injected at runtime via `/config.js` | Public by design (enforced by RLS). |
| `SUPABASE_DB_URL` | Compose env | Full DB access — keep secret. |
| `AUTO_LOGIN_PASSWORD` | Injected at runtime via `/config.js` | **Not a secret once set** — `/config.js` is static and unauthenticated, so anyone who can reach the app can read this password. Only enable auto-login on a fully trusted network. |

## Transport and Brute-Force Protection

- **TLS / HSTS:** the app container serves plain HTTP on port 80 and is meant to sit behind a TLS-terminating reverse proxy (Caddy, Traefik, a Cloudflare tunnel, …). Send `Strict-Transport-Security` from that proxy, not from the container, so a plain-HTTP LAN setup isn't broken. Example for Caddy: `header Strict-Transport-Security "max-age=31536000"`.
- **Auth rate limit:** the bundled nginx limits password sign-in, sign-up, recovery/OTP and password changes (`PUT /auth/v1/user`) to 10 requests per minute per client address, with a burst of 5, answering `429` beyond that. Token refreshes and other reads are not limited. The limit keys on the TCP peer address, so behind a shared reverse proxy all users share one bucket — fine for a household instance. If you use Supabase Cloud instead of the bundled GoTrue, configure its own limits in the dashboard.
- **Password change** re-verifies the current password in the UI. A stolen session can still call `PUT /auth/v1/user` directly; GoTrue's `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true` closes that but needs SMTP for the reauthentication email.

## Known Limitations (post-v1 backlog)

- TypeScript strict mode is not fully enabled; some `any` types exist in the frontend.
- The importer does not enforce a rate limit on the `/transactions/import` endpoint.
- Auth loading state has no timeout guard (planned: add `finally` to the auth context).

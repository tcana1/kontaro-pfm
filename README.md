# Kontaro — Personal Finance Manager

**Your financial data, on your own server.**

Kontaro is an open-source, self-hosted personal finance manager built for people who want full control over their data — no subscriptions, no third-party clouds, no vendor lock-in. Run it on a home server, a VPS, or a Raspberry Pi.

[![App CI](https://github.com/tcana1/kontaro-pfm/actions/workflows/app-ci.yml/badge.svg)](https://github.com/tcana1/kontaro-pfm/actions/workflows/app-ci.yml)
[![Importer CI](https://github.com/tcana1/kontaro-pfm/actions/workflows/importer-ci.yml/badge.svg)](https://github.com/tcana1/kontaro-pfm/actions/workflows/importer-ci.yml)
[![MCP CI](https://github.com/tcana1/kontaro-pfm/actions/workflows/mcp-ci.yml/badge.svg)](https://github.com/tcana1/kontaro-pfm/actions/workflows/mcp-ci.yml)

<p align="center"><img src="docs/dashboard_en.png" alt="Dashboard, desktop" width="75.1%"><img src="docs/dashboard-mobile-dark.png" alt="Dashboard, mobile, dark mode" width="24.8%"></p>

---

## Features

- **Automatic bank sync** — connects to Brazilian banks (Itaú, C6, Nubank, Bradesco, and more) via [Pluggy](https://pluggy.ai) Open Finance. Transactions land in your dashboard daily without any manual work.
- **Statement import** — upload PDF, Excel (.xls/.xlsx), or OFX extracts from any bank. The importer identifies the file, parses it, and deduplicates on re-import.
- **History import** — bring in an existing categorized history from a spreadsheet. Start from the [Excel template](docs/history-import.md) (also downloadable in **Settings → History**).
- **Transaction management** — categorise, tag, split, and reconcile transactions. Bulk-edit, payee normalisation, installment tracking, and transfer linking included.
- **AI-powered monthly analysis** — an [MCP](https://modelcontextprotocol.io) server exposes your data to AI assistants (Claude, Cursor, OpenCode). Ask questions, get anomaly reports, and save insights back to the dashboard.
- **Multi-account** — track checking accounts, credit cards, and investments together. Account balances update in real time.
- **Self-hosted** — runs as a Docker Compose stack. Choose between a fully local Postgres setup or Supabase Cloud for the database.
- **Internationalised** — English and Brazilian Portuguese out of the box; add any locale in minutes.

<p align="center"><img src="docs/transactions.png" alt="Transactions, desktop" width="75.1%"><img src="docs/transactions-mobile-dark.png" alt="Transactions, mobile, dark mode" width="24.8%"></p>

[More screenshots →](docs/screenshots.md)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend (`app/`) | React 18 · TypeScript · Tailwind CSS · shadcn/ui |
| Database | PostgreSQL 17 · GoTrue (auth) · Row-Level Security |
| Importer (`importer/`) | Python 3.12 · FastAPI |
| MCP server (`mcp/`) | Python 3.12 · FastMCP (Model Context Protocol) |

---

## Contents

- [Prerequisites](#prerequisites)
- [Deployment modes](#deployment-modes)
  - [Selfhost — full local stack](#selfhost--full-local-stack)
  - [Cloud — Supabase hosted](#cloud--supabase-hosted)
  - [Local dev — Supabase CLI](#local-dev--supabase-cli)
- [Pluggy connector setup](#pluggy-connector-setup)
- [MCP server — AI assistant integration](#mcp-server--ai-assistant-integration)
- [Managing users (selfhost)](#managing-users-selfhost)
- [Internationalization (i18n)](#internationalization-i18n)
- [Updating](#updating)
- [Backup and restore](#backup-and-restore)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)

---

## Prerequisites

- [Docker](https://www.docker.com/) + Docker Compose v2
- _(Cloud mode only)_ A [Supabase](https://supabase.com) project
- _(Optional)_ A [Pluggy](https://pluggy.ai) client ID and secret for automated bank sync

---

## Deployment modes

| Mode | Database | Auth | When to use |
|---|---|---|---|
| **Selfhost** | Local Postgres container | Local GoTrue container | Fully local, no external accounts |
| **Cloud** | Supabase Cloud | Supabase Cloud | Managed DB, no infra to run |
| **Dev** | Supabase CLI (`supabase start`) | Supabase CLI | Local development |

### Auth modes (JWT signing)

Kontaro accepts both of Supabase's token-signing schemes, so you don't have to migrate your project to get it running:

| Mode | API key | JWT signing | Set in `.env` |
|---|---|---|---|
| **Cloud** | legacy anon key **or** publishable key (`sb_publishable_…`) | **new JWT Signing Keys** (asymmetric ES256/RS256) **or** legacy HS256 secret | `SUPABASE_JWT_SIGNING_KEY` (new) **or** `SUPABASE_JWT_SECRET` (legacy) |
| **Selfhost** | n/a — local GoTrue | **HS256 shared secret only** | `SUPABASE_JWT_SECRET` |

- **Cloud, new mode:** the importer verifies user tokens against your project's JWKS automatically (no secret needed); the MCP mints its own tokens and needs the private signing key in `SUPABASE_JWT_SIGNING_KEY`. See the commented block in `.env.example`.
- **Cloud, legacy mode:** uncomment `SUPABASE_JWT_SECRET` instead — still valid until Supabase retires the legacy secret.
- **Selfhost** uses the HS256 shared secret by design (GoTrue signs, PostgREST / importer / MCP verify with the same value). Asymmetric signing keys are a Supabase Cloud feature and don't apply.

### Selfhost — full local stack

Everything runs locally: Postgres, GoTrue (auth), PostgREST, the app, and the importer. No Supabase account needed.

#### 1. Clone and configure

```bash
git clone https://github.com/tcana1/kontaro-pfm.git && cd kontaro-pfm
cp .env.selfhost.example .env
```

Open `.env` and fill in the required variables:

| Variable | How to generate |
|---|---|
| `SUPABASE_JWT_SECRET` | `openssl rand -hex 32` |
| `DB_PASSWORD` | `openssl rand -hex 16` |
| `SUPABASE_DB_URL` | Replace `<password>` in the template with your `DB_PASSWORD` |
| `SUPABASE_URL` | `http://localhost:8181` — or your hostname/IP for remote access |
| `SECRETS_ENC_KEY` | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `COMPOSE_PROFILES` | Set to `selfhost` — avoids passing `--profile selfhost` on every docker compose command |

> **Back up `SECRETS_ENC_KEY` separately from your database.** It encrypts Pluggy credentials and PDF passwords — losing it makes them permanently irrecoverable.

#### 2. Start

```bash
docker compose up -d    # no --profile needed if COMPOSE_PROFILES=selfhost is set in .env
```

On first boot Postgres initialises (~10–15 s), then the `migrate` container applies all SQL migrations, then the app and importer start. Subsequent starts are fast.

> **Port 54332 already in use?** A local `supabase start` stack defaults to the same port. Set both `DB_PORT` and update `SUPABASE_DB_URL` in `.env` to the same free port, then re-run `docker compose up -d --force-recreate db`.

| Service | URL |
|---|---|
| App | http://localhost:8181 |
| Importer API + Swagger | http://localhost:8181/api/docs |

#### 3. Create your first user

```bash
./kontaro.sh create-user you@example.com
```

The password is read from a prompt, so it stays out of your shell history and out of
`ps`. Set `PFM_PASSWORD` instead if you need this to run unattended.

Then sign in at http://localhost:8181. To enable bank sync, see [Pluggy connector setup](#pluggy-connector-setup).

### Cloud — Supabase hosted

Use Supabase Cloud for the database and auth; run only the app and importer via Docker.

#### 1. Clone and configure

```bash
git clone https://github.com/tcana1/kontaro-pfm.git && cd kontaro-pfm
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Project Settings → API → Publishable key (or the legacy anon key) |
| JWT signing | See [Auth modes](#auth-modes-jwt-signing) — set `SUPABASE_JWT_SIGNING_KEY` (new) or `SUPABASE_JWT_SECRET` (legacy) |
| `DATABASE_URL` | Project Settings → Database → Connection Pooling → **Session pooler** (see note below) |
| `SECRETS_ENC_KEY` | Generate: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

> **Use the Session pooler, not the direct connection, for `DATABASE_URL`.** The direct host (`db.<project>.supabase.co`) resolves IPv6-only unless you pay for the IPv4 add-on, and the importer/mcp containers don't have an IPv6 route — imports fail with `Network is unreachable`. The Session pooler host (`aws-0-<region>.pooler.supabase.com`, port `5432`, user `postgres.<project-ref>`) is IPv4-compatible. The one-off `migrate` step (which applies SQL migrations, over host networking) reuses this same value automatically — set `SUPABASE_DB_URL` instead only if you need it to use a different connection (e.g. a non-pooled superuser role).

#### 2. Configure Auth redirect URLs

In the Supabase dashboard: **Authentication → URL Configuration**.

| Field | Value |
|---|---|
| Site URL | `http://localhost:8181` (or wherever the app is reachable — must match `APP_PORT`/your domain) |
| Redirect URLs | add `http://localhost:8181/**` |

Without this, Supabase ignores the app's `emailRedirectTo` on signup/reset emails and falls back to its default Site URL (`http://localhost:3000`), so confirmation links land on a page that doesn't exist instead of `/auth/callback`.

#### 3. Apply migrations

```bash
docker compose run --rm migrate
```

#### 4. Start

```bash
docker compose up -d
```

Sign up at http://localhost:8181. To enable bank sync, see [Pluggy connector setup](#pluggy-connector-setup).

### Local dev — Supabase CLI

```bash
supabase start          # note the URLs and keys it prints
cp .env.example .env    # fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET
                        # set SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54332/postgres
docker compose up -d
```

The `migrate` container uses host networking to reach the Supabase CLI DB at `127.0.0.1:54332`. This requires Linux (or Docker Desktop 4.34+ with host networking enabled on Mac/Windows).

---

## Pluggy connector setup

[Pluggy](https://pluggy.ai) is a Brazilian Open Finance aggregator that connects to 200+ institutions (Itaú, C6, Nubank, Bradesco, Santander, XP, and more) and fetches your transactions automatically. You need a Pluggy account and API credentials to use this feature.

To enable automated daily bank sync:

1. Create a [Pluggy](https://pluggy.ai) account and obtain a client ID and secret.
2. In the app: **Settings → Connectors → Add connector** — enter your credentials and map Pluggy account IDs to PFM accounts.
3. Run the initial backfill:
   ```bash
   docker compose run --rm importer python -m src.sources.pluggy.sync --mode initial
   ```
4. The importer runs a built-in scheduler — no cron/systemd setup needed. It syncs
   automatically at the times set in `SYNC_TIMES` (default `08:00,13:00,18:00`,
   up to 3 comma-separated `HH:MM` slots). Pluggy itself only refreshes each
   connection once a day at an unpredictable time, so a few slots spread through
   the day catch it sooner than a single fixed check. Set `SYNC_TIMES=` (empty)
   to disable and rely on the "Sync now" button or your own cron running:
   ```bash
   docker compose run --rm importer python -m src.sources.pluggy.sync --mode daily
   ```
   > **Timezone note:** `SYNC_TIMES` runs on the importer **container's clock**,
   > which is UTC by default (most Docker base images) — not the per-connector
   > timezone set in **Settings → Connectors**. That setting only affects how
   > Pluggy statement timestamps are interpreted (transaction dates); it has no
   > effect on the scheduler. If you're in `America/Sao_Paulo` (UTC-3) and want
   > the sync to run at 08:00/13:00/18:00 local time, set
   > `SYNC_TIMES=11:00,16:00,21:00`.

---

## MCP server — AI assistant integration

PFM ships a [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your financial data to AI assistants (Claude Code, OpenCode, Cursor, or any MCP client). The server runs alongside the app and is proxied at `/mcp` by the same nginx instance, so no extra port needs to be opened.

> **Don't want the AI server?** The MCP is opt-in via the `mcp` Compose profile. The env templates include it in `COMPOSE_PROFILES` by default; remove `mcp` from that line in your `.env` to run the stack (app + importer) without it. Nothing else depends on the MCP.

### Setup

**1. Generate an API key** — sign in, go to **Settings → Profile → API Key**, and generate one.

**2. Add the MCP server to your agent.** For Claude Code, add to `.claude/mcp.json` (or the equivalent config for your client):

```json
{
  "mcpServers": {
    "pfm": {
      "type": "http",
      "url": "http://localhost:8181/mcp",
      "headers": { "x-api-key": "pfm_your_key_here" }
    }
  }
}
```

Replace `http://localhost:8181` with your app's public URL if running remotely.

**3. Run the monthly analysis.** Open the **Analysis** drawer in the dashboard — it shows the exact prompt to paste into your agent. The agent queries your data, presents a draft for review, and saves the final report back to the dashboard via `save_insight_run`.

### Available tools

All tools are scoped to the authenticated user (resolved from the API key).

| Tool | Description |
|---|---|
| `get_monthly_totals` | Net spend vs prior month and same month last year |
| `get_category_trends` | Top categories with 6-month historical trend |
| `get_spending_surprises` | Categories deviating from their 3-month baseline |
| `get_expense_breakdown` | Grouped expense totals for a date range |
| `get_income_vs_expenses` | Income vs expense summary for a date range |
| `get_category_ranking` | Category rankings with year-over-year totals |
| `list_transactions` | Paginated transaction list with filters |
| `get_top_merchants_for_category` | Top merchants by spend within a category |
| `get_tag_summary` | Spend per tag and the categories they span |
| `list_tags` / `list_payees` / `list_categories` / `list_accounts` | Reference data |
| `query_postgrest` | Generic read-only query for anything the above don't cover |
| `save_insight_run` | Persist a monthly analysis report to the dashboard |
| `get_insight_run` | Retrieve the latest saved report for a month |
| `get_analysis_state` / `set_analysis_state` | Per-user knowledge base for the agent across runs |

### Prompt

The server also exposes a `monthly_analysis` MCP prompt that orchestrates the full workflow: load prior context, query the month's data, surface anomalies (cross-referencing tags and notes before flagging anything), draft the report in chat, and — only after your confirmation — call `save_insight_run` to publish it to the dashboard.

---

## Managing users (selfhost)

```bash
./kontaro.sh create-user user@example.com
./kontaro.sh reset-password user@example.com
```

Both commands prompt for the password rather than taking it as an argument. Export
`PFM_PASSWORD` to supply it non-interactively.

To allow open sign-up, set `GOTRUE_DISABLE_SIGNUP=false` in `.env` and restart GoTrue:

```bash
docker compose --profile selfhost up -d gotrue
```

### Auto-login (optional)

For single-user setups where you don't want a login screen, set these in `.env`:

```env
AUTO_LOGIN_EMAIL=you@example.com
AUTO_LOGIN_PASSWORD=yourpassword
```

The app will sign in automatically on first load. Works in both selfhost and cloud modes.

> **⚠️ The password is readable by anyone who can reach the app.** Runtime config is served as a
> static, unauthenticated `GET /config.js`, so `AUTO_LOGIN_PASSWORD` reaches the browser in
> cleartext — `curl http://your-host:8181/config.js` returns it. Only enable this on a network
> where every client is already trusted (a LAN or VPN you control), never on a host reachable
> from the internet. Leave both variables blank to get a normal login screen.

### Email password reset (optional)

By default, passwords are managed via the CLI commands above. To enable the **Forgot password** email flow (users request a reset link from the login page), configure SMTP in `.env` and restart GoTrue:

| Variable | Description |
|---|---|
| `GOTRUE_SMTP_HOST` | SMTP hostname (e.g. `smtp.mailgun.org`) |
| `GOTRUE_SMTP_PORT` | Port — `587` for STARTTLS, `465` for SSL |
| `GOTRUE_SMTP_USER` | SMTP username |
| `GOTRUE_SMTP_PASS` | SMTP password / API key |
| `GOTRUE_SMTP_ADMIN_EMAIL` | Sender address (e.g. `noreply@yourdomain.com`) |
| `GOTRUE_SMTP_SENDER_NAME` | Display name in the From field |

```bash
docker compose --profile selfhost up -d gotrue
```

> **No SMTP account?** [Resend](https://resend.com), [Mailgun](https://mailgun.com), and [Brevo](https://brevo.com) all have generous free tiers. The CLI commands above always work regardless of SMTP configuration.

---

## Internationalization (i18n)

The frontend uses [react-i18next](https://react.i18next.com/) with a **natural key strategy**: the English string itself is the translation key. `en.json` stays empty — i18next falls back to the key when the value is an empty string.

### Adding a new locale

**1. Register in the parser config** (`app/i18next-parser.config.cjs`):

```js
locales: ['en', 'pt-BR', 'es'],
```

**2. Register in the i18n initializer** (`app/client/src/i18n.ts`):

```ts
import es from './locales/es.json';
i18n.init({ resources: { ..., es: { translation: es } } });
```

**3. Add an entry to `LANG_META`** (`app/client/src/lib/supported-languages.ts`):

```ts
'es': { locale: 'es-ES', labelEN: 'Spanish (Spain)', labelPT: 'Espanhol (Espanha)', uiLabel: 'Español' },
```

This is the only place you need to touch: both the onboarding wizard and the Settings language picker derive their lists from `LANG_META` filtered by `i18n.options.resources` at runtime.

**4. Generate the catalog**:

```bash
cd app && npm run i18n:extract
```

Creates `app/client/src/locales/es.json` with all keys and empty values. Any key left as `""` falls back to the English key at runtime.

**5. Translate** — fill in `es.json` and commit along with the config/code changes.

### Keeping the catalog in sync

When you add a new user-visible string, wrap it in `t()` and re-run `npm run i18n:extract`. The CI `i18n-catalog` job fails if the committed JSONs don't match the extracted output.

| File | Purpose |
|---|---|
| `app/client/src/locales/en.json` | Key source of truth; values intentionally empty |
| `app/client/src/locales/pt-BR.json` | Brazilian Portuguese translations |
| `app/i18next-parser.config.cjs` | Parser config — input globs, locales list |
| `app/client/src/i18n.ts` | i18next initialization |

---

## Updating

```bash
git pull
docker compose build                            # rebuild images
docker compose up -d                            # or: --profile selfhost
```

Pending migrations are applied automatically by the `migrate` container on every `up -d`. Never use `docker compose restart` to update — it skips migrations.

---

## Backup and restore

### Selfhost

```bash
# Backup (requires the stack to be running)
./kontaro.sh backup
# → backup-YYYYMMDD-HHMMSS.sql in the repo root

# Use a different env file (applies to every kontaro.sh command)
./kontaro.sh --env-file .env.other backup

# Restore
docker compose --profile selfhost up -d db
docker compose --profile selfhost exec db psql -U postgres postgres < backup-YYYYMMDD-HHMMSS.sql
docker compose --profile selfhost up -d
```

### Cloud

Use `pg_dump` against your Supabase DB URL, or enable Point-in-Time Recovery in the Supabase dashboard (paid plans).

---

## Architecture

```
Browser / AI agent
  │  HTTP(S)
  ▼
nginx               ← serves the React SPA; reverse-proxies /api/ and /mcp
  ├── /api/      → importer:8000
  ├── /mcp       → mcp:3100
  ├── /rest/v1/  → postgrest:3000   (selfhost only)
  └── /auth/v1/  → gotrue:9999      (selfhost only)

importer            ← FastAPI — parses statements, calls Pluggy, writes transactions
mcp                 ← FastMCP — exposes financial read/write tools to AI assistants
  │  PostgREST + SECURITY DEFINER RPCs
  ▼
postgres            ← PostgreSQL 17 + RLS
```

In cloud/dev modes the browser talks to Supabase endpoints directly; nginx only handles `/api/`. In selfhost mode nginx also proxies auth and REST.

---

## Repository layout

```
.
├── app/                    React frontend
│   ├── client/src/
│   ├── Dockerfile
│   ├── entrypoint.sh       Runtime config injection + nginx startup
│   └── default.conf.template  Nginx routing
├── importer/               Statement importer (FastAPI)
│   ├── src/
│   │   ├── parsers/        PDF/Excel bank parsers
│   │   ├── sources/        Pluggy provider + sync
│   │   ├── services/       Import pipeline
│   │   └── security/       Fernet encryption
│   └── tests/
├── mcp/                    MCP server (FastMCP)
│   ├── server.py           Tool definitions + API key middleware
│   └── tests/
├── supabase/
│   └── migrations/         SQL migrations (applied in filename order)
├── docker-compose.yml
├── .env.example            Cloud mode env template
├── .env.selfhost.example   Selfhost mode env template
├── kontaro.sh              User management + backup helpers
└── SECURITY.md
```

---

## Contributing

This is a personal project. Issues and discussions are welcome; pull requests may be accepted but are not actively solicited. If you plan something significant, open an issue first.

See [SECURITY.md](SECURITY.md) for the threat model and vulnerability reporting.

---

## License

See [LICENSE](LICENSE).

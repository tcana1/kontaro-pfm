# PFM — App (frontend)

The React single-page application of the PFM monorepo. This README is the developer-facing
documentation for the frontend. For installation, deployment modes, and the overall project
overview, see the [root README](../README.md).

---

## Contents

- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Running in development](#running-in-development)
- [Runtime & deployment](#runtime--deployment)
- [How data flows](#how-data-flows)
- [Cache & invalidation](#cache--invalidation)
- [Design conventions](#design-conventions)
- [Testing](#testing)
- [CI](#ci)
- [Internationalization (i18n)](#internationalization-i18n)

---

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript, Tailwind CSS, shadcn/ui, framer-motion, recharts / chart.js |
| Routing | wouter |
| State / data | TanStack Query, React Context, react-hook-form + zod |
| Backend client | `@supabase/supabase-js` (typed via generated `database.types.ts`) |
| i18n | react-i18next (natural-key strategy) |
| Build | Vite (root: `client/`), SWC |
| Testing | Vitest, Testing Library (jsdom) |

The app talks to a Supabase/PostgREST backend (see [How data flows](#how-data-flows)) and to the
[importer](../importer/README.md) service via `/api`.

---

## Repository layout

```
app/
├── client/
│   ├── index.html             # loads /config.js, then /src/main.tsx
│   ├── .env                   # dev-only VITE_* environment (not committed)
│   └── src/
│       ├── main.tsx           # QueryClient → AuthProvider → FinanceProvider → App
│       ├── App.tsx            # wouter <Switch> + ProtectedRoute + providers
│       ├── i18n.ts            # i18next setup (resources, detector, fallback)
│       ├── pages/             # route-level components
│       ├── components/        # domain UI (accounts, transactions, reports, settings, ui/…)
│       ├── contexts/          # auth, finance, history (undo/redo), mobile-header
│       ├── hooks/             # useServiceQuery, useHistory, useReconciliation, …
│       ├── services/          # supabase-service.ts (data-access layer) + query helpers
│       ├── lib/               # supabase client, queryClient, cacheUtils, importer, config
│       ├── utils/             # transaction/transfer/csv/hash helpers
│       └── locales/           # en.json (keys), pt-BR.json
├── shared/
│   └── schema.ts              # Drizzle + Zod schemas (types only — see below)
├── tests/                     # Vitest suites (unit + integration, mocks, setup)
├── config.js.template         # runtime config template → /config.js at boot
├── default.conf.template      # nginx routing (selfhost proxies + /api → importer)
├── entrypoint.sh              # runtime config injection + nginx startup
├── Dockerfile                 # multi-stage build (node:20-alpine → nginx:1.27-alpine)
├── drizzle.config.ts          # dormant Drizzle config (migrations live in supabase/)
├── vite.config.ts             # dev server, /__supabase proxy, build outDir
└── vitest.config.ts           # jsdom, forks pool, setupFiles
```

Migrations are **not** managed from here: the single source of truth is SQL files in
`supabase/migrations/` at the repository root, applied by the `migrate` compose container or the
Supabase CLI. `drizzle.config.ts` and `shared/schema.ts` exist for type/validation generation and
are not part of the runtime migration path.

---

## Running in development

### Option 1 — full stack via Docker Compose (recommended)

```bash
docker compose up -d
```

Starts Postgres, GoTrue, PostgREST, the importer, and the app together. See the root
README for env setup and profiles.

### Option 2 — Vite dev server against Supabase

```bash
cd app
npm ci
cp client/.env.example client/.env   # or create client/.env
npm run dev
```

The Vite server listens on port **8181**. Load the Supabase env from `client/.env`:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase URL (e.g. `http://127.0.0.1:54331` for `supabase start`) |
| `VITE_SUPABASE_ANON_KEY` | Publishable/anon key |
| `VITE_IMPORTER_URL` | Importer base URL (default `/api`, resolved against the app origin) |
| `VITE_AUTO_LOGIN_EMAIL` / `VITE_AUTO_LOGIN_PASSWORD` | Optional dev auto-login |
| `VITE_ALLOWED_HOSTS` | Comma-separated hostname allowlist for the dev server |

When `VITE_SUPABASE_URL` points at a local address, Vite auto-enables a `__supabase` reverse
proxy (override with `SUPABASE_DEV_PROXY_TARGET`). `lib/supabase.ts` rewrites local Supabase URLs
to `${origin}/__supabase` whenever the browser host isn't local — this is how a remote device (on
your LAN or a VPN such as Tailscale) reaches a local Supabase through the dev server.

### Migrations in dev

```bash
supabase migration up        # applies supabase/migrations/ against the local stack
```

---

## Runtime & deployment

The production image is served by nginx (`Dockerfile`). No build args carry secrets — all
configuration is injected at container start by `entrypoint.sh`:

1. **Anon key**: if `SUPABASE_ANON_KEY` is unset but `SUPABASE_JWT_SECRET` is provided (selfhost
   mode), a stable HS256 anon JWT is derived from the secret (fixed claims, `iat=0`).
2. **Runtime config**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OAUTH_ENABLED` are substituted into
   `config.js.template` → `/usr/share/nginx/html/config.js` (`window.__PFM_CONFIG__`).
3. **Nginx routing**: `POSTGREST_URL` (default `http://postgrest:3000`) and `GOTRUE_URL` (default
   `http://gotrue:8081`) are substituted into `default.conf.template`.

`default.conf.template` behavior:

| Route | Target | Notes |
|---|---|---|
| `/api/` | `http://importer:8000` | Prefix stripped; importer needs no public port |
| `/rest/v1/` | PostgREST | Selfhost only; dead route in cloud mode |
| `/auth/v1/` | GoTrue | Selfhost only; dead route in cloud mode |
| `/config.js` | — | `no-store` + strict security headers + CSP |
| `/assets/` | — | Immutable, `max-age=1y` |
| `/` | — | SPA fallback → `/index.html` |

In **cloud mode** `supabase-js` talks straight to the Supabase URL and nginx only proxies `/api/`;
in **selfhost mode** nginx also proxies REST and auth. See the root README for the full matrix.

---

## How data flows

The app reads and writes through PostgREST with **Row-Level Security** (`auth.uid()`). The main
read path is a view — `v_transaction_splits` (created with `security_invoker='on'` so RLS
propagates) — which joins transactions to their splits and account/category names.

```
UI component
   │  hooks/useServiceQuery (or useQuery)
   ▼
services/supabase-service.ts      # SupabaseService singleton (~60 methods)
   │  PostgREST /rest/v1/ + RPC calls, typed by database.types.ts
   ▼
Supabase (Postgres + views + RLS)
```

### `SupabaseService` (`services/supabase-service.ts`)

Single class, exported as a singleton. Method groups:

- **Transactions**: `getTransactions` (queries `v_transaction_splits` with `{ count: 'exact' }`,
  then transforms rows and fans out splits), `createUniqueTransaction` (SHA-256 `unique_hash`
  dedupe), linked/transfer operations, `batchUpdateTransactions`, generic CRUD.
- **Master data**: accounts, categories, groups, settings, categorization rules, payee ops.
- **Tags**: CRUD, merge, stats, per-tag queries.
- **Reconciliation**: `getReconciledTransactionIds` via `reconciliation_items`.
- **Merge/collapse**: match candidates, `mergeTransactions`, `explodeTransaction`,
  `collapseTransactions`.
- **RPC passthrough**: `rpc(name, params)` — reports call `get_expense_breakdown`,
  `get_category_breakdown`, `get_account_balances`, `count_filtered_transactions`, etc.

### Query helpers (`services/transaction-query-helpers.ts`)

Pure, unit-tested functions that translate UI filters to PostgREST conditions:
`parseSearchParams` (locale-aware amount + tolerance), `buildSearchConditions` (unaccented
`ilike` on six columns + amount ranges), `applyFilters`/`applySort`, `resolveColumnName`
(UI → DB column), `fanOutSiblings`, `findLinkedTransaction`, `transformRow`.

### TanStack Query

`lib/queryClient.ts` sets `staleTime: 2 min`, `gcTime: 30 min`, `retry: 3` with capped
exponential backoff. Query keys are flat domain strings (`'accounts'`, `'categories'`,
`'transactions'`, `'tags'`, `'account-balances'`, RPC-name keys for raw queries). Once
authenticated, `FinanceProvider` prefetches core data and **polls every 30 s** via
`CacheUtils.invalidateAllCore`.

---

## Cache & invalidation

Writes go through an **optimistic** layer: commands update the query cache immediately, await the
DB write, then invalidate; failed writes revert the cache. `lib/commands/transaction-commands.ts`
implements `ICommand`/`ICommandWithResult` (create, update, delete, batch, status) and is pushed
onto the undo/redo stack in `hooks/useHistory.ts` (`HistoryProvider` wraps the transactions page).

Invalidation is centralised in `lib/cacheUtils.ts` (`InvalidationManager` + `CacheUtils` façade):

- **Batched (default)** — `invalidateTransactionRelated`, `invalidateAccountRelated`,
  `invalidateCategoryRelated`, `invalidateSettings`, `invalidateTagRelated`,
  `invalidateCategorizationRules`. Accumulated invalidation sets are flushed on a **50 ms
  debounce** to prevent cache thrashing.
- **Immediate** — `invalidateTransactionRelatedImmediate`, `invalidateAccountRelatedImmediate`.
  Reserved for operations that need instant feedback: **reconciliation completion**, navigation,
  error recovery. Do not convert batched calls to immediate without justification.
- **`invalidateAllCore`** — for the 30 s FinanceProvider poll.

---

## Design conventions

- **snake_case everywhere.** After a field-name normalization refactor, the DB and all app layers
  use `snake_case`. `sanitizeTransactionForUpdate()` accepts legacy `camelCase` and current
  `snake_case` and normalizes both for backward compatibility.
- **Sentinel rows** carry meaning: category `0` = Uncategorized, `TRANSFER_PAYMENT_CATEGORY_ID
  = -4` = transfer/payment, Starting Balance payee `id = -1`.
- **Auth** — `contexts/auth-context.tsx` wraps GoTrue: session restore, sign-in (password/OAuth,
  gated by `OAUTH_ENABLED`), password reset flow via `/auth/callback` and `/auth/reset-password`,
  route protection in `components/auth/protected-route.tsx`. Dev auto-login via
  `VITE_AUTO_LOGIN_EMAIL`/`VITE_AUTO_LOGIN_PASSWORD`.
- **Theming** — shadcn + Tailwind CSS variables; `light`/`dark`/`system` preference persisted in
  the settings table.
- **Shared schema** — `shared/schema.ts` defines Drizzle tables and Zod insert schemas used for
  type generation and validation, but is not the migration source of truth (see above).

---

## Testing

```bash
npx vitest run      # run the full suite (no watch)
npx vitest          # watch mode
npx vitest run --coverage
```

Tests live in `tests/`:

- `tests/unit/` — pure-logic tests (date/currency/hash/transfer utils, query helpers, batch-edit
  and undo logic, command/history behavior) plus small component tests.
- `tests/integration/` — CRUD and page-level flows (`transactions-page`, `transaction-crud`,
  batch-edit restrictions, error propagation, account-specific views).
- `tests/setup.ts` — i18next init, jest-dom matchers, observer/polyfill stubs.
- `tests/mocks/` — shared fixtures (`mock-data.ts`) and API handlers (legacy MSW; the app talks
  PostgREST, so the dominant pattern is `vi.mock()` of `supabase-service`, `useServiceQuery`,
  and contexts).

Per project convention, tests focus on command and CRUD integration rather than complex UI/E2E
scenarios. Run the full suite before committing — CI runs the same command.

---

## CI

`.github/workflows/app-ci.yml` runs on push/PR to `main` with changes under `app/**`:

| Job | Command | Gate |
|---|---|---|
| `test` | `npx vitest run` | — |
| `typecheck` | `npm run check` (= `tsc`) | needs `test` |
| `i18n-catalog` | `npm run i18n:extract` + fails on drift | needs `test` |
| `build` | `npm run build` | needs `typecheck` + `i18n-catalog` |

Placeholder `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` values are used throughout.

---

## Internationalization (i18n)

The app uses **natural-key** i18n: the English string is the translation key. `en.json`
values are intentionally `""` and i18next falls back to the key (`returnEmptyString: false`),
so untranslated strings never break the UI.

- Catalogs: `client/src/locales/{en,pt-BR}.json` (plus any new locale).
- Parser config: `i18next-parser.config.cjs`.
- Init: `client/src/i18n.ts`.

After wrapping a new user-visible string in `t()`, refresh the catalogs:

```bash
npm run i18n:extract
```

Commit the resulting diff — the CI `i18n-catalog` job fails if the committed JSONs don't match
the extracted output.

---

See the [root README](../README.md) for install, deployment modes, backups, and the importer
documentation in [`importer/README.md`](../importer/README.md).
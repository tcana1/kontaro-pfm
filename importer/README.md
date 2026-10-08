# PFM — Importer

The ingestion service of the PFM monorepo. A FastAPI service that parses financial statements,
pulls bank data via Pluggy Open Finance, and writes transactions into the PFM Postgres database.
This README covers the service's architecture and development workflow; see the
[root README](../README.md) for installation, deployment, and the full-stack Compose setup.

---

## Contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Development setup](#development-setup)
- [Authentication](#authentication)
- [Import pipeline](#import-pipeline)
- [Duplicate detection](#duplicate-detection)
- [Auto-categorization](#auto-categorization)
- [Parsers](#parsers)
- [Pluggy sync](#pluggy-sync)
- [Database access](#database-access)
- [Security](#security)
- [Endpoints](#endpoints)
- [Testing](#testing)
- [History & context](#history--context)

---

## Architecture

```
file upload (PDF/XLS) ──┐
                        ├──▶ identify → resolve account → parse
Pluggy Open Finance ────┘                        │
                                                 ▼
                        normalize (hash) → categorize → batch insert (dedupe)
                                                 │
                                                 ▼
                                            Postgres (psycopg2)
```

There are two entry points — an HTTP file upload and the Pluggy provider — but both funnel into
the same source-agnostic core: `src/pipeline.py::run_pipeline()` for file uploads and
`src/services/import_service.py::import_batch()` for batch JSON / Pluggy sync. Wiring is a
single FastAPI app (`app.py`) running on psycopg2 (no ORM, no async).

---

## Repository layout

```
importer/
├── app.py                    # all routes + auth (single FastAPI app)
├── src/
│   ├── context.py            # contextvars per-request user_id
│   ├── exceptions.py         # EmptyStatementError, UnsupportedLayoutError, ErrorCode
│   ├── pipeline.py           # normalize → categorize → import lifecycle (file path)
│   ├── database/db_handler.py# all PostgreSQL access (psycopg2)
│   ├── models/import_models.py  # Pydantic request/response models
│   ├── output/               # excel/csv/json response renderers
│   ├── parsers/              # 9 bank statement parsers
│   ├── processing/           # normalizer, categorizer, transaction model
│   ├── security/             # Fernet encryption for secrets at rest
│   ├── services/import_service.py  # import_batch() — batch/sync import core
│   ├── sources/pluggy/       # Pluggy provider + sync CLI
│   └── utils/                # file_identifier, account_utils, date_utils, …
├── scripts/                  # PDF extract / anonymize tooling
└── tests/
    ├── …                     # mocked unit + fixture tests
    └── real-data/            # real statements + DB tests (gitignored, needs DATABASE_URL)
```

---

## Development setup

```bash
cd importer
python3 -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # fill in values
uvicorn app:app --reload --port 8000
```

Environment variables (see `.env.example` for selfhost/dev/cloud variants):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SUPABASE_JWT_SECRET` | HS256 JWT verification (must match root `.env`) |
| `SUPABASE_URL` | JWKS fallback for ES256/RS256 tokens (selfhost: `http://localhost:8181`) |
| `SECRETS_ENC_KEY` | Fernet key — **mandatory at boot**; back it up separately from the DB |
| `OPENEXCHANGERATES_APP_ID` | Currency conversion for C6 Global (USD/EUR) statements — see the note below |
| `CORS_ORIGINS` | Comma-separated allowlist (no wildcard) |
| `LOG_LEVEL` / `ENVIRONMENT` | Logging / environment labels |

> **C6 Global statements without an Open Exchange Rates key.** The key is optional only in
> the sense that the import still runs. Amounts are stored **unconverted** — a EUR or USD
> figure sitting in a BRL column — so every balance and report that includes them is
> understated, with no visual marker beyond the `EUR <value>` note on the split. Set the key
> (per-user in Settings, or this env var) before importing these statements, or fix the
> amounts by hand afterwards. A key that's set but fails for a specific date is handled
> differently: that transaction is skipped rather than stored wrong.

Run the tests: `pytest` (see [Testing](#testing)).

---

## Authentication

Every endpoint requires one of two credentials (checked in order):

1. **`Authorization: Bearer <jwt>`** — a Supabase user JWT. First verified with HS256 against
   `SUPABASE_JWT_SECRET` (audience `authenticated`); falls back to ES256/RS256 via the JWKS
   endpoint at `SUPABASE_URL/auth/v1/.well-known/jwks.json`. The `sub` claim is the user id.
2. **`x-api-key: <key>`** — the header value is SHA-256-hashed and looked up in the `user_api_keys`
   table (revoked keys excluded). API keys are generated in the frontend under **Settings → API
   Keys**; the plaintext is never stored.

Both resolve to a `user_id` stored in `src/context.py` (contextvars) and carried through every
DB query. Missing/invalid credentials → `403`.

---

## Import pipeline

### File upload (`POST /process-statement/`)

1. **Validate** the upload: extension, content-type, size (<3 MB), magic bytes.
2. **Identify** the file (`src/utils/file_identifier.py`): extract text (pdfplumber for PDF,
   openpyxl/xlrd for Excel), detect the bank, statement type, and variant (e.g. C6 Global EUR/USD).
3. **Resolve the account** against the `account_import_rules` table (regex on text/filename
   patterns); ambiguous or unknown → `422`. The `account_id` query param overrides detection.
4. **Dispatch to the parser** matching bank/format/type (see [Parsers](#parsers)).
5. **`run_pipeline()`**: stamp `account_id`/`source_file` → normalize → categorize →
   `create_import_batch(status='running')` → `insert_transactions()` →
   `finalize_import_batch('success'|'partial'|'failed')`. Parse errors after account resolution
   are recorded as a failed `import_batches` row with an `ErrorCode`.

`output_format` selects the renderer (`excel`, `csv`, `json`, `none`, comma-separated); each
response carries `X-Success`, `X-Transaction-Count`, and `X-Total-Amount` headers.

### Batch JSON / sync (`POST /transactions/import`, Pluggy sync)

`import_service.import_batch()` runs the same pipeline over structured transactions:

1. Resolve `account_slug` → account id (`404` if unknown).
2. Pre-check duplicates by computing the hashes and querying existing ones.
3. Run `run_pipeline()`.
4. **PENDING→POSTED upsert**: transactions with `status_id == 3` and a `statement_identifier`
   promote existing Pending (1) rows to Posted (3) — Cleared (2) rows are never touched.

The Pluggy sync path calls `import_batch()` in-process (no HTTP round-trip) with
`source="pluggy-sync"`.

---

## Duplicate detection

The dedupe key is a SHA-256 hash over:

```
payment_date + payee(lowercased) + amount(2 dp) + installment_number + account_id + statement_identifier
```

- Identical base hashes within one batch get `_1`, `_2`, … suffixes so legitimately same-day /
  same-amount transactions remain distinct.
- The DB insert uses `ON CONFLICT (unique_hash) DO NOTHING` — re-running an import is safe.
- `statement_identifier` also namespaces the hash per statement period; Pluggy transactions use
  `"pluggy:{id}"`.

---

## Auto-categorization

When a split has no explicit `category_id`, the categorizer (`src/processing/categorizer.py`)
assigns a category by priority:

1. **Keyword rules** — substring match against the `categorization_rules` table; longest matching
   keyword wins.
2. **Installment history** — for `installment_number >= 2`: look up past imports matching payee +
   purchase_date ±1 day + amount within ±0.05; the category is reused only if **100% consistent**.
3. **Payee history** — reuse the payee's category if past transactions agree on a single category,
   or if one category holds a **≥80% share**.
4. **Default** — category `0` (Uncategorized).

Providing `category_id` on a split bypasses all rules.

---

## Parsers

All parsers output a list of transactions and are dispatched from the file fingerprint:

| Parser file | Bank / format |
|---|---|
| `itau_parser.py` | Itaú credit card PDF |
| `itau_credit_card_excel_parser.py` | Itaú credit card XLS (`Lançamentos` sheet) |
| `itau_account_parser.py` | Itaú checking XLS |
| `c6_parser.py` | C6 Graphene credit card PDF |
| `c6_global_eur_parser.py` / `c6_global_usd_parser.py` | C6 Conta Global EUR/USD PDF (converts via Open Exchange Rates) |
| `porto_parser.py` | Porto Seguro Visa PDF |
| `btg_parser.py` | BTG Master PDF |
| `xp_parser.py` | XP Visa PDF |

PDF text extraction is pdfplumber-based. Year inference across statement boundaries is handled by
`determine_transaction_year()` in `src/utils/date_utils.py`.

---

## Pluggy sync

`src/sources/pluggy/` implements the automated bank connector (supercedes the older Cumbuca
Open Finance flow; see [History & context](#history--context)):

- **`provider.py`** — `PluggyProvider` wrapping the Pluggy REST API (`urllib`): OAuth-style API
  key fetch (2 h validity), v2 cursor pagination (cap ~200 pages), PENDING/POSTED mapping,
  payee/encoding cleanup, and per-user timezone for payment dates. On the credit-card side,
  invoice *payments* (`categoryId == "05100000"` or "pagamento recebido") are dropped so card
  spend isn't double counted — the same category is kept on the checking-account side, where
  it's a real cash outflow (boleto payment, automatic debit).
- **`sync.py`** — multi-tenant sync CLI:
  ```bash
  python -m src.sources.pluggy.sync --mode daily [--dry-run]
  python -m src.sources.pluggy.sync --mode initial [--dry-run]
  ```
  - `initial` — backfill from the connector's `import_from` (default 365 days).
  - `daily` — **incremental, filtered server-side**. Credit cards run two queries since the stored
    marker minus a 2-day margin: `createdAtFrom` (records Pluggy created since then — closing-time
    installments, backdated credits) and `dateFrom` (pre-created installments whose date arrived).
    Bank accounts use a date window. With no marker yet, it backfills from `import_from` (or 60 days).
  - Already-imported rows are matched by Pluggy id (`statement_identifier = pluggy:<id>`) and skipped,
    never updated — Pluggy mutates descriptions/dates of existing ids, so the content hash is not reliable.
- **State lives in Postgres** (`connector_sync_state` table: `last_sync_at`, `last_error`,
  `last_synced_created_at` marker — the start time of the last successful sync; manual resyncs
  never advance it). The root `pluggy_sync_state.json` is a legacy leftover from the
  pre-merge Open Finance client and is no longer used.

The sync iterates every enabled connector across all users (decrypting each
`client_secret_enc`), scoping each account's writes to that connector's own `user_id`, and
imports through `import_batch()` directly.

---

## Database access

All Postgres access is in `src/database/db_handler.py` (psycopg2, 10 s connect timeout,
30 s statement timeout). Every query is scoped by the contextvars `user_id` — row-level filtering
is applied in SQL (the one cross-user read is the privileged `get_all_enabled_connectors()` for
the sync operator).

Key tables: `accounts` (with `slug`), `transactions` (`unique_hash`, `payment_date`,
`payee`, `status_id`, `installment_*`, `statement_identifier`, `import_batch_id`),
`transaction_splits`, `categories`/`category_groups`, `categorization_rules`,
`account_import_rules`, `user_api_keys`, `user_pdf_passwords`, `user_openexchange_keys`,
`connectors`/`connector_accounts`, `connector_sync_state`, `import_batches`.

**`status_id` semantics:**

| id | Meaning |
|---|---|
| `1` | Pending |
| `2` | Cleared |
| `3` | Posted (Pluggy `POSTED`) |
| `99` | Ignored / soft-delete |

Inserts are batched (`execute_values`, 50/batch) with `ON CONFLICT (unique_hash) DO NOTHING` and
per-batch commits; failed batches retry row-by-row.

---

## Security

- **Fernet encryption** (`src/security/crypto.py`) with the `SECRETS_ENC_KEY` env var, required
  at import time (the app refuses to boot without it). Encrypted blobs carry a `v1:` scheme
  prefix so the key format can be versioned/rotated.
- **What's encrypted at rest**: Pluggy connector client secrets (`connectors.client_secret_enc`),
  PDF passwords (`user_pdf_passwords.password_enc` — API responses only expose id + label),
  and the Open Exchange Rates key. API keys are never stored — only their SHA-256 hash.
- **Other hardening**: `defusedxml.defuse_stdlib()` (XXE), cell-formula injection sanitization in
  the Excel writer, magic-byte upload validation, random temp filenames, and a strict CORS
  origin allowlist.
- **Warning**: losing `SECRETS_ENC_KEY` makes all encrypted credentials and PDF passwords
  permanently irrecoverable. Back it up separately from the database.

---

## Endpoints

All require auth (JWT Bearer or `x-api-key`). Interactive docs at `/docs` (OpenAPI) when running
in dev.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness probe (no auth, excluded from OpenAPI) |
| `POST /process-statement/` | Upload a PDF/XLS statement. Params: `output_format` (`excel`/`json`/`csv`/`none`), `dry_run`, `account_id` |
| `POST /transactions/import` | Import structured transactions. Body: `{"account_slug": string, "dry_run": bool, "source": string, "transactions": [{payment_date, purchase_date, payee, splits: [{amount, category_id?, notes?}], status_id?, installment_number?, installment_total?, statement_identifier?}]}` |
| `PATCH /transactions/{id}/status` | Update transaction status; never overwrites Cleared (2) / 99; ids `{1,2,3,99}` |
| `GET/POST /import-rules`, `DELETE /import-rules/{id}` | Account-detection regex rules |
| `GET/POST /pdf-passwords`, `DELETE /pdf-passwords/{id}` | Stored PDF passwords (Fernet-encrypted) |
| `GET/PUT/DELETE /openexchange-key` | Open Exchange Rates key (encrypted) |
| `POST/GET/PATCH/DELETE /connectors` | Pluggy connector CRUD |
| `GET /connectors/{id}/pluggy-accounts` | List Pluggy accounts for a connector |
| `POST /connectors/{id}/sync` | Trigger a sync (`202` + background task) |

The batch-import response reports `transaction_count`, `inserted`, `updated`, `duplicates`,
`failed`, `total_amount`, and `dry_run`. See `src/models/import_models.py` for the full schema.

---

## Testing

```bash
pytest          # from importer/
```

- **Unit & fixture tests** (CI, no DB): mocked-cursor database tests, `app.py`/auth tests with
  `TestClient`, parser tests over text fixtures, plus categorizer/normalizer/output/security and
  Pluggy tests.
- **`tests/real-data/`** — real statement PDFs/XLS and real-Postgres tests; **gitignored** and
  excluded from CI. Requires `DATABASE_URL` and a `TEST_USER_ID`. These hold real statements
  (names, card numbers, PDF passwords), so they must be scrubbed before ever being shared.

---

See the [root README](../README.md) for full-stack setup and the
[app README](../app/README.md) for the frontend.
"""Pluggy multi-tenant sync — imports transactions for all enabled connectors.

Usage:
    python -m src.sources.pluggy.sync [--dry-run] [--mode daily|initial]

Modes:
    daily    (default) Incremental. Credit cards run two server-side queries
             since the stored marker (minus a safety margin): records Pluggy
             created since then (closing-time installments, backdated credits)
             and records whose date has arrived (pre-created future installments).
             Bank accounts use a date window. Reads/writes sync state from DB.
    initial  Backfill from connector's import_from date (or 365 days if unset).
             Use with --dry-run on first run to preview.

Rows already imported are identified by their Pluggy id (statement_identifier)
and skipped, never updated.

Env vars (required):
    DATABASE_URL         PostgreSQL connection string
    SECRETS_ENC_KEY      Fernet key used to decrypt stored Pluggy credentials
"""

import argparse
import sys
import urllib.error
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent.parent / ".env")

from src import context
from src.database import db_handler as _db
from src.processing.transaction_model import Transaction, TransactionSplit
from src.security import crypto
from src.services import import_service
from src.sources.pluggy.provider import PfmTransaction, PluggyProvider

INITIAL_BACKFILL_DAYS = 60
DAILY_WINDOW_DAYS = 7
SYNC_MARGIN_DAYS = 2


def _to_transaction(tx: PfmTransaction) -> Transaction:
    return Transaction(
        payment_date=tx.payment_date,
        purchase_date=tx.purchase_date,
        payee=tx.payee,
        status_id=tx.status_id,
        statement_identifier=tx.statement_identifier,
        installment_number=tx.installment_number,
        installment_total=tx.installment_total,
        splits=[TransactionSplit(amount=tx.amount)],
    )


def _pluggy_http_error_msg(code: int) -> str:
    if code == 410:
        return "Account not yet synced by Pluggy — try again later"
    if code in (401, 403):
        return "Invalid Pluggy credentials"
    return "Pluggy API error"


def _fetch(account: dict, provider: PluggyProvider, import_from, mode: str,
           date_from_override, today: date) -> tuple[list[PfmTransaction], bool]:
    """Returns (transactions, advance_marker)."""
    pluggy_id = account["pluggy_account_id"]
    account_type = account["type"]
    backfill_from = import_from if import_from else (today - timedelta(days=INITIAL_BACKFILL_DAYS))

    if date_from_override:
        print(f"  Fetching from {date_from_override}")
        return provider.fetch_transactions(pluggy_id, date_from_override, account_type), False

    if mode == "initial":
        date_from = import_from if import_from else (today - timedelta(days=365))
        print(f"  Fetching from {date_from}")
        return provider.fetch_transactions(pluggy_id, date_from, account_type), False

    state = _db.get_connector_sync_state(account["id"])
    marker = state.get("last_synced_created_at")
    margin = timedelta(days=SYNC_MARGIN_DAYS)

    if not marker:
        print(f"  No sync marker — backfilling from {backfill_from}")
        return provider.fetch_transactions(pluggy_id, backfill_from, account_type), True

    if account_type == "bank":
        date_from = min(today - timedelta(days=DAILY_WINDOW_DAYS), marker.date())
        print(f"  Fetching from {date_from}")
        return provider.fetch_transactions(pluggy_id, date_from, account_type), True

    created_from = marker - margin
    date_from = marker.date() - margin
    print(f"  Fetching created since {created_from:%Y-%m-%d %H:%M} and dated since {date_from}")
    created = provider.fetch_transactions(pluggy_id, account_type=account_type, created_at_from=created_from)
    dated = provider.fetch_transactions(pluggy_id, date_from, account_type)
    by_id = {t.statement_identifier: t for t in created}
    for t in dated:
        by_id.setdefault(t.statement_identifier, t)
    return list(by_id.values()), True


def sync_account(
    account: dict,
    provider: PluggyProvider,
    import_from,          # date | None — floor; None = no restriction
    mode: str,
    dry_run: bool,
    date_from_override=None,  # date | None — user-requested resync floor; bypasses marker logic
) -> None:
    connector_account_id = account["id"]
    account_slug = account["account_slug"]

    print(f"\n{'─'*60}")
    print(f"  {account['name']}  ({account_slug})")
    print(f"{'─'*60}")

    today = date.today()
    started_at = datetime.now(timezone.utc)

    try:
        txs, advance_marker = _fetch(account, provider, import_from, mode, date_from_override, today)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(_pluggy_http_error_msg(exc.code)) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError("Network error connecting to Pluggy") from exc

    if import_from:
        txs = [tx for tx in txs if tx.payment_date >= import_from]

    if txs:
        account_id = _db.get_account_id_by_slug_or_fail(account_slug)
        known = _db.get_existing_statement_identifiers(account_id, [t.statement_identifier for t in txs])
        txs = [t for t in txs if t.statement_identifier not in known]

    if not txs:
        print("  Nothing to import.")
    else:
        txs_internal = [_to_transaction(t) for t in txs]
        result = import_service.import_batch(account_slug, txs_internal, source="pluggy-sync", dry_run=dry_run)
        print(f"  import → {result}")

    if mode == "daily" and not dry_run:
        _db.store_connector_sync_state(
            connector_account_id, None, started_at if advance_marker else None
        )


def run_sync(mode: str = "daily", dry_run: bool = False) -> None:
    """Sync every enabled connector, across all users.

    Shared by the CLI entrypoint (below) and the in-process scheduler
    (src/scheduler.py), which calls this on a timer instead of via subprocess.
    Each connector's own user_id (below) scopes the writes — there is no
    separate operator credential to authenticate.
    """
    connectors = _db.get_all_enabled_connectors()
    if not connectors:
        print("No enabled connectors found.")
        return

    if dry_run:
        print("  [DRY RUN — nenhum dado será gravado]")

    for connector in connectors:
        connector_id = connector["id"]
        context.set_user_id(connector["user_id"])

        try:
            client_secret = crypto.decrypt(connector["client_secret_enc"])
            provider = PluggyProvider(
                client_id=connector["client_id"],
                client_secret=client_secret,
                tz=connector["timezone"],
            )
        except Exception as exc:
            print(f"ERROR authenticating connector {connector_id}: {exc}", file=sys.stderr)
            continue

        accounts = _db.get_connector_accounts(connector_id)
        import_from = connector.get("import_from")

        for account in accounts:
            try:
                sync_account(account, provider, import_from, mode, dry_run)
            except Exception as exc:
                print(f"  ERROR syncing {account['name']}: {exc}", file=sys.stderr)
                if not dry_run:
                    try:
                        _db.store_connector_sync_state(account["id"], str(exc))
                    except Exception as exc2:
                        print(
                            f"  ERROR storing sync state for {account['name']}: {exc2}",
                            file=sys.stderr,
                        )


def main():
    parser = argparse.ArgumentParser(description="Pluggy → PFM multi-tenant sync")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mode", choices=["daily", "initial"], default="daily")
    args = parser.parse_args()

    try:
        run_sync(mode=args.mode, dry_run=args.dry_run)
    except RuntimeError as exc:
        sys.exit(f"Erro: {exc}")


if __name__ == "__main__":
    main()

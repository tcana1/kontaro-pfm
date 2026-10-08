"""Unit tests for Pluggy sync — _to_transaction mapper and sync_account logic."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from src.processing.transaction_model import Transaction, TransactionSplit
from src.sources.pluggy.base import PfmTransaction
from src.sources.pluggy.sync import (
    DAILY_WINDOW_DAYS,
    INITIAL_BACKFILL_DAYS,
    SYNC_MARGIN_DAYS,
    _to_transaction,
    sync_account,
)

# ── _to_transaction ───────────────────────────────────────────────────────────

def _make_pfm(
    payment_date=date(2026, 9, 15),
    purchase_date=date(2026, 9, 10),
    payee="Test Payee",
    amount=Decimal("-150.75"),
    status_id=1,
    statement_identifier="pluggy:abc-123",
    installment_number=None,
    installment_total=None,
) -> PfmTransaction:
    return PfmTransaction(
        payment_date=payment_date,
        purchase_date=purchase_date,
        payee=payee,
        amount=amount,
        status_id=status_id,
        statement_identifier=statement_identifier,
        installment_number=installment_number,
        installment_total=installment_total,
    )


class TestToTransaction:
    def test_basic_fields_are_mapped(self):
        tx = _to_transaction(_make_pfm())
        assert isinstance(tx, Transaction)
        assert tx.payment_date == date(2026, 9, 15)
        assert tx.purchase_date == date(2026, 9, 10)
        assert tx.payee == "Test Payee"
        assert tx.status_id == 1
        assert tx.statement_identifier == "pluggy:abc-123"

    def test_amount_passed_through_as_decimal(self):
        # PfmTransaction.amount is Decimal end-to-end; _to_transaction must not re-wrap it
        tx = _to_transaction(_make_pfm(amount=Decimal("-45.50")))
        assert isinstance(tx.splits[0].amount, Decimal)
        assert tx.splits[0].amount == Decimal("-45.50")

    def test_negative_amount_expense(self):
        tx = _to_transaction(_make_pfm(amount=Decimal("-200.00")))
        assert tx.splits[0].amount == Decimal("-200.00")
        assert tx.amount < 0

    def test_positive_amount_credit_refund(self):
        tx = _to_transaction(_make_pfm(amount=Decimal("50.25")))
        assert tx.splits[0].amount == Decimal("50.25")
        assert tx.amount > 0

    def test_decimal_amount_preserved_exactly(self):
        tx = _to_transaction(_make_pfm(amount=Decimal("-82.10")))
        assert tx.splits[0].amount == Decimal("-82.10")

    def test_installment_fields_mapped(self):
        tx = _to_transaction(_make_pfm(installment_number=3, installment_total=12))
        assert tx.installment_number == 3
        assert tx.installment_total == 12

    def test_installment_fields_none_when_absent(self):
        tx = _to_transaction(_make_pfm())
        assert tx.installment_number is None
        assert tx.installment_total is None

    def test_statement_identifier_preserved(self):
        tx = _to_transaction(_make_pfm(statement_identifier="pluggy:uuid-deadbeef"))
        assert tx.statement_identifier == "pluggy:uuid-deadbeef"

    def test_status_id_preserved(self):
        tx = _to_transaction(_make_pfm(status_id=2))
        assert tx.status_id == 2

    def test_single_split_created(self):
        tx = _to_transaction(_make_pfm(amount=-100.00))
        assert len(tx.splits) == 1
        assert isinstance(tx.splits[0], TransactionSplit)

    def test_account_id_not_set_by_mapper(self):
        tx = _to_transaction(_make_pfm())
        assert tx.account_id is None

    def test_source_file_not_set_by_mapper(self):
        tx = _to_transaction(_make_pfm())
        assert tx.source_file is None


# ── sync_account ──────────────────────────────────────────────────────────────

FIXED_TODAY = date(2026, 9, 8)
MARKER = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)
MARGIN = timedelta(days=SYNC_MARGIN_DAYS)


def _make_account(account_type="credit_card"):
    return {
        "id": 1,
        "pluggy_account_id": "pluggy-acct-uuid",
        "account_slug": "itau-visa",
        "name": "Itaú Visa",
        "type": account_type,
    }


def _make_provider(transactions=None):
    provider = MagicMock()
    provider.get_api_key.return_value = "api-key-xyz"
    provider.fetch_transactions.return_value = transactions or []
    return provider


def _make_pfm_tx(payment_date=FIXED_TODAY, sid="pluggy:abc-123"):
    return _make_pfm(
        payment_date=payment_date, purchase_date=payment_date,
        amount=Decimal("-50.00"), statement_identifier=sid,
    )


def _db_with(mock_db, state=None, known=()):
    mock_db.get_connector_sync_state.return_value = state if state is not None else {}
    mock_db.get_existing_statement_identifiers.return_value = set(known)
    return mock_db


@pytest.fixture(autouse=True)
def freeze_today():
    """Patch date.today() to a fixed date for all sync_account tests."""
    with patch("src.sources.pluggy.sync.date") as mock_date_cls:
        mock_date_cls.today.return_value = FIXED_TODAY
        mock_date_cls.min = date.min
        yield mock_date_cls


class TestSyncAccountInitialMode:
    def test_uses_import_from_when_given(self):
        import_from = date(2026, 1, 1)
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db"), \
             patch("src.sources.pluggy.sync.import_service"):
            sync_account(_make_account(), provider, import_from, mode="initial", dry_run=False)

        provider.fetch_transactions.assert_called_once()
        assert provider.fetch_transactions.call_args[0][1] == import_from

    def test_falls_back_to_365_days_when_no_import_from(self):
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db"), \
             patch("src.sources.pluggy.sync.import_service"):
            sync_account(_make_account(), provider, None, mode="initial", dry_run=False)

        assert provider.fetch_transactions.call_args[0][1] == FIXED_TODAY - timedelta(days=365)

    def test_state_not_stored_in_initial_mode(self):
        provider = _make_provider(transactions=[_make_pfm_tx()])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db)
            sync_account(_make_account(), provider, None, mode="initial", dry_run=False)

        mock_db.store_connector_sync_state.assert_not_called()


class TestSyncAccountNoMarker:
    @pytest.mark.parametrize("account_type", ["bank", "credit_card"])
    def test_backfills_from_initial_window(self, account_type):
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={})
            sync_account(_make_account(account_type), provider, None, mode="daily", dry_run=False)

        provider.fetch_transactions.assert_called_once()
        assert provider.fetch_transactions.call_args[0][1] == FIXED_TODAY - timedelta(days=INITIAL_BACKFILL_DAYS)

    def test_backfill_uses_import_from(self):
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={})
            sync_account(_make_account(), provider, date(2026, 3, 1), mode="daily", dry_run=False)

        assert provider.fetch_transactions.call_args[0][1] == date(2026, 3, 1)

    def test_state_without_marker_is_treated_as_no_marker(self):
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": None, "last_error": "x"})
            sync_account(_make_account(), provider, None, mode="daily", dry_run=False)

        assert provider.fetch_transactions.call_args[0][1] == FIXED_TODAY - timedelta(days=INITIAL_BACKFILL_DAYS)


class TestSyncAccountDailyBank:
    def test_marker_newer_than_window_keeps_daily_window(self):
        marker = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": marker})
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        assert provider.fetch_transactions.call_args[0][1] == FIXED_TODAY - timedelta(days=DAILY_WINDOW_DAYS)

    def test_marker_older_than_window_extends_date_from(self):
        marker = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": marker})
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        assert provider.fetch_transactions.call_args[0][1] == date(2026, 8, 20)


class TestSyncAccountDailyCreditCard:
    def test_runs_created_at_and_date_queries_with_margin(self):
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            sync_account(_make_account("credit_card"), provider, None, mode="daily", dry_run=False)

        calls = provider.fetch_transactions.call_args_list
        assert len(calls) == 2
        created_call = next(c for c in calls if "created_at_from" in c.kwargs)
        dated_call = next(c for c in calls if "created_at_from" not in c.kwargs)
        assert created_call.kwargs["created_at_from"] == MARKER - MARGIN
        assert dated_call.args[1] == MARKER.date() - MARGIN

    def test_does_not_call_bills_endpoint(self):
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            sync_account(_make_account("credit_card"), provider, None, mode="daily", dry_run=False)

        provider.fetch_bills_for_account.assert_not_called()

    def test_union_of_both_queries_is_deduped_by_pluggy_id(self):
        dup = _make_pfm_tx(sid="pluggy:dup")
        created_only = _make_pfm_tx(sid="pluggy:created")
        dated_only = _make_pfm_tx(sid="pluggy:dated")
        provider = MagicMock()
        provider.fetch_transactions.side_effect = lambda *a, **kw: (
            [dup, created_only] if "created_at_from" in kw else [dup, dated_only]
        )
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            sync_account(_make_account("credit_card"), provider, None, mode="daily", dry_run=False)

        sent = mock_import.import_batch.call_args[0][1]
        assert sorted(t.statement_identifier for t in sent) == ["pluggy:created", "pluggy:dated", "pluggy:dup"]


class TestSyncAccountMarker:
    def test_successful_sync_stores_start_time_as_marker(self):
        provider = _make_provider(transactions=[_make_pfm_tx()])
        before = datetime.now(timezone.utc)
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)
        after = datetime.now(timezone.utc)

        args = mock_db.store_connector_sync_state.call_args[0]
        assert args[0] == 1 and args[1] is None
        assert before <= args[2] <= after

    def test_marker_not_advanced_when_fetch_fails(self):
        provider = MagicMock()
        provider.fetch_transactions.side_effect = RuntimeError("boom")
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            with pytest.raises(RuntimeError):
                sync_account(_make_account("credit_card"), provider, None, mode="daily", dry_run=False)

        mock_db.store_connector_sync_state.assert_not_called()

    def test_marker_not_advanced_when_import_fails(self):
        provider = _make_provider(transactions=[_make_pfm_tx()])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            mock_import.import_batch.side_effect = RuntimeError("db down")
            with pytest.raises(RuntimeError):
                sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        mock_db.store_connector_sync_state.assert_not_called()


class TestSyncAccountDedupeByPluggyId:
    def test_already_imported_ids_are_skipped_even_if_mutated(self):
        # Pluggy mutated payee/date of an already-imported id → hash would differ,
        # but the id is known so it must not be re-imported.
        mutated = _make_pfm(payee="DM*Spotify", payment_date=date(2026, 9, 8), statement_identifier="pluggy:known")
        fresh = _make_pfm_tx(sid="pluggy:fresh")
        provider = _make_provider(transactions=[mutated, fresh])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db, known={"pluggy:known"})
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        sent = mock_import.import_batch.call_args[0][1]
        assert [t.statement_identifier for t in sent] == ["pluggy:fresh"]

    def test_all_known_skips_import(self):
        provider = _make_provider(transactions=[_make_pfm_tx(sid="pluggy:known")])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db, known={"pluggy:known"})
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        mock_import.import_batch.assert_not_called()


class TestSyncAccountImportAndState:
    def test_no_transactions_skips_import(self):
        provider = _make_provider(transactions=[])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db)
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        mock_import.import_batch.assert_not_called()

    def test_no_transactions_still_stores_state_in_daily_mode(self):
        provider = _make_provider(transactions=[])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            sync_account(_make_account(), provider, None, mode="daily", dry_run=False)

        mock_db.store_connector_sync_state.assert_called_once()

    def test_with_transactions_calls_import_batch(self):
        provider = _make_provider(transactions=[_make_pfm_tx()])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db)
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False)

        mock_import.import_batch.assert_called_once()
        assert mock_import.import_batch.call_args[1]["dry_run"] is False

    def test_dry_run_does_not_store_state(self):
        provider = _make_provider(transactions=[_make_pfm_tx()])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db)
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=True)

        mock_db.store_connector_sync_state.assert_not_called()

    def test_import_from_filters_transactions_in_daily_mode(self):
        early_tx = _make_pfm_tx(payment_date=date(2026, 1, 1), sid="pluggy:early")
        recent_tx = _make_pfm_tx(payment_date=date(2026, 8, 1), sid="pluggy:recent")
        provider = _make_provider(transactions=[early_tx, recent_tx])

        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service") as mock_import:
            _db_with(mock_db)
            sync_account(_make_account("bank"), provider, date(2026, 6, 1), mode="daily", dry_run=False)

        called_txs = mock_import.import_batch.call_args[0][1]
        assert len(called_txs) == 1
        assert called_txs[0].payment_date == date(2026, 8, 1)


class TestSyncAccountDateFromOverride:
    """Manual 'resync from date' — date-only fetch, never advances the marker."""

    @pytest.mark.parametrize("account_type", ["bank", "credit_card"])
    def test_uses_override_directly_without_reading_state(self, account_type):
        override = date(2026, 1, 15)
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db, state={"last_synced_created_at": MARKER})
            sync_account(_make_account(account_type), provider, None, mode="daily", dry_run=False,
                          date_from_override=override)

        provider.fetch_transactions.assert_called_once()
        assert provider.fetch_transactions.call_args[0][1] == override
        mock_db.get_connector_sync_state.assert_not_called()

    def test_override_records_sync_without_advancing_marker(self):
        provider = _make_provider(transactions=[_make_pfm_tx()])
        with patch("src.sources.pluggy.sync._db") as mock_db, \
             patch("src.sources.pluggy.sync.import_service"):
            _db_with(mock_db)
            sync_account(_make_account("bank"), provider, None, mode="daily", dry_run=False,
                          date_from_override=date(2026, 1, 15))

        args = mock_db.store_connector_sync_state.call_args[0]
        assert args[1] is None and args[2] is None

    def test_override_takes_precedence_over_initial_mode(self):
        override = date(2026, 1, 15)
        provider = _make_provider()
        with patch("src.sources.pluggy.sync._db"), \
             patch("src.sources.pluggy.sync.import_service"):
            sync_account(_make_account("bank"), provider, date(2020, 1, 1), mode="initial", dry_run=False,
                          date_from_override=override)

        assert provider.fetch_transactions.call_args[0][1] == override

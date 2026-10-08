"""Tests for import_service.import_batch.

Mocks only at the DB boundary — normalizer, categorizer, and pipeline run for real.
This exercises account stamping, hash generation, duplicate detection, and
upsert logic that were invisible when pipeline was fully mocked.
"""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from src.database.db_handler import InsertResult
from src.processing.transaction_model import Transaction, TransactionSplit
from src.services.import_service import import_batch


def _tx(payee="Mercado", amount="-50.00", status_id=1, identifier="pluggy:abc-1"):
    return Transaction(
        payment_date=date(2024, 7, 1),
        purchase_date=date(2024, 6, 30),
        payee=payee,
        status_id=status_id,
        statement_identifier=identifier,
        splits=[TransactionSplit(amount=Decimal(amount))],
    )


@pytest.fixture
def db_mocks():
    """Patch only DB calls; normalizer, categorizer, and pipeline run for real."""
    insert_result = InsertResult(inserted=1, duplicates=0, failed=0)
    with patch("src.database.db_handler.get_account_id_by_slug_or_fail", return_value=42) as mock_acct, \
         patch("src.database.db_handler.get_existing_transaction_hashes", return_value=set()) as mock_hashes, \
         patch("src.database.db_handler.get_categorization_rules", return_value={}) as _mock_rules, \
         patch("src.database.db_handler.get_payee_category_distribution_batch", return_value={}) as _mock_dist, \
         patch("src.database.db_handler.get_installment_categories_batch", return_value={}) as _mock_inst, \
         patch("src.database.db_handler.insert_transactions", return_value=insert_result) as mock_insert, \
         patch("src.database.db_handler.abort_stale_batches", return_value=0), \
         patch("src.pipeline.get_user_id", return_value="test-user-id"), \
         patch("src.database.db_handler.create_import_batch", return_value=1), \
         patch("src.database.db_handler.finalize_import_batch"):
        yield {
            "account": mock_acct,
            "hashes": mock_hashes,
            "insert": mock_insert,
            "insert_result": insert_result,
        }


class TestStamping:
    def test_account_id_and_source_stamped_on_every_transaction(self, db_mocks):
        txs = [_tx("Mercado"), _tx("Netflix", "-15.90", identifier="pluggy:abc-2")]
        import_batch("itau-visa", txs, source="pluggy-sync", dry_run=True)
        for tx in txs:
            assert tx.account_id == 42
            assert tx.source_file == "pluggy-sync"


class TestResultCounts:
    def test_insert_result_counts_reflected(self, db_mocks):
        db_mocks["insert_result"] = InsertResult(inserted=2, duplicates=0, failed=1)
        db_mocks["insert"].return_value = db_mocks["insert_result"]
        txs = [_tx(), _tx("Netflix", "-15.90", identifier="pluggy:abc-2")]
        result = import_batch("itau-visa", txs, source="pluggy-sync", dry_run=False)
        assert result.inserted == 2
        assert result.failed == 1
        assert result.transaction_count == 2
        assert result.dry_run is False

    def test_dry_run_skips_insert_and_estimates_inserted_as_count(self, db_mocks):
        txs = [_tx(), _tx("Netflix", "-15.90", identifier="pluggy:abc-2")]
        result = import_batch("itau-visa", txs, source="pluggy-sync", dry_run=True)
        db_mocks["insert"].assert_not_called()
        assert result.dry_run is True
        assert result.inserted == result.transaction_count

    def test_unknown_account_slug_raises_value_error(self, db_mocks):
        db_mocks["account"].side_effect = ValueError("Account not found")
        with pytest.raises(ValueError, match="Account not found"):
            import_batch("nonexistent", [_tx()], source="test", dry_run=False)


class TestDuplicateDetection:
    def test_existing_hash_count_becomes_duplicates(self, db_mocks):
        # Return 2 arbitrary "already existing" hashes regardless of input
        db_mocks["hashes"].return_value = {"existing-hash-a", "existing-hash-b"}
        txs = [_tx(), _tx("Netflix", "-15.90", identifier="pluggy:abc-2"), _tx("Uber", "-22.00", identifier="pluggy:abc-3")]
        result = import_batch("itau-visa", txs, source="pluggy-sync", dry_run=False)
        # duplicates = the 2 existing hashes
        assert result.duplicates == 2

"""P1-1: inserted counts must come from the real RETURNING set, not subtraction.

Mocks the cursor/connection the same way the DB layer is exercised elsewhere,
without touching a real database (tests/real-data is out of CI).
"""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from src.database.transactions import (
    _insert_transactions_batch,
    _insert_transactions_individual,
    insert_transactions,
)
from src.processing.transaction_model import (
    CategorizedTransaction,
    Transaction,
    TransactionSplit,
)


def make_cat_tx(unique_hash: str, amount: str = "10.00") -> CategorizedTransaction:
    tx = Transaction(
        payment_date=date(2026, 9, 1),
        purchase_date=date(2026, 9, 1),
        payee="Test Payee",
        unique_hash=unique_hash,
        splits=[TransactionSplit(amount=Decimal(amount))],
    )
    return CategorizedTransaction(transaction=tx, category_id=1)


# ── _insert_transactions_batch ────────────────────────────────────────────────

class TestBatchReturnsReturningHashes:
    def test_returns_hashes_from_returning(self):
        txs = [make_cat_tx(f"h{i}") for i in range(3)]
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.fetchall.return_value = [(10, "h0"), (11, "h1"), (12, "h2")]

        with patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("psycopg2.extras.execute_values") as mock_ev:
            # 1st call: INSERT ... RETURNING unique_hash; 2nd call: splits insert
            mock_ev.side_effect = [[("h0",), ("h1",), ("h2",)], None]
            failed, inserted = _insert_transactions_batch(mock_conn, mock_cur, txs, batch_size=50)

        assert failed == []
        assert inserted == {"h0", "h1", "h2"}

    def test_failed_batch_hashes_are_not_counted(self):
        txs = [make_cat_tx("h0")]
        mock_conn = MagicMock()
        mock_cur = MagicMock()

        with patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("psycopg2.extras.execute_values", side_effect=RuntimeError("db boom")):
            failed, inserted = _insert_transactions_batch(mock_conn, mock_cur, txs, batch_size=50)

        assert failed == txs
        assert inserted == set()


# ── _insert_transactions_individual ───────────────────────────────────────────

class TestIndividualReturnsInsertedHashes:
    def test_counts_hash_when_row_inserted(self):
        txs = [make_cat_tx("h1")]
        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = (99,)  # id → row was inserted

        with patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("psycopg2.extras.execute_values"):
            failed, errors, inserted = _insert_transactions_individual(MagicMock(), mock_cur, txs)

        assert failed == []
        assert errors == []
        assert inserted == {"h1"}

    def test_duplicate_row_is_not_counted(self):
        txs = [make_cat_tx("h1")]
        mock_cur = MagicMock()
        mock_cur.fetchone.return_value = None  # ON CONFLICT DO NOTHING → duplicate

        with patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("psycopg2.extras.execute_values"):
            failed, errors, inserted = _insert_transactions_individual(MagicMock(), mock_cur, txs)

        assert failed == []
        assert errors == []
        assert inserted == set()


# ── insert_transactions ───────────────────────────────────────────────────────

class TestInsertTransactionsCounts:
    def _run(self, txs, existing, batch_result):
        mock_conn = MagicMock()
        with patch("src.database.connection.get_db_connection", return_value=mock_conn), \
             patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("src.database.transactions.get_existing_transaction_hashes", return_value=existing), \
             patch("src.database.transactions._insert_transactions_batch", return_value=batch_result), \
             patch("src.database.transactions._insert_transactions_individual") as mock_ind:
            result = insert_transactions(txs)
        return result, mock_ind

    def test_three_new_two_duplicates(self):
        new = [make_cat_tx(f"new{i}") for i in range(3)]
        dups = [make_cat_tx(f"dup{i}") for i in range(2)]
        result, mock_ind = self._run(
            new + dups,
            existing={"dup0", "dup1"},
            batch_result=([], {"new0", "new1", "new2"}),
        )

        assert result.inserted == 3
        assert result.duplicates == 2
        assert result.failed == 0
        mock_ind.assert_not_called()

    def test_count_follows_returning_not_subtraction(self):
        # Concurrent insert: pre-check misses new2, ON CONFLICT skips it, RETURNING reports 2.
        # Subtraction (5 - 0 - 2) would wrongly report 3.
        new = [make_cat_tx(f"new{i}") for i in range(3)]
        dups = [make_cat_tx(f"dup{i}") for i in range(2)]
        result, _ = self._run(
            new + dups,
            existing={"dup0", "dup1"},
            batch_result=([], {"new0", "new1"}),
        )

        assert result.inserted == 2
        assert result.duplicates == 2
        assert result.failed == 0

    def test_failed_transactions_reported(self):
        txs = [make_cat_tx("new0"), make_cat_tx("new1")]
        # Batch fails, individual retry also fails for one of them
        mock_conn = MagicMock()
        with patch("src.database.connection.get_db_connection", return_value=mock_conn), \
             patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("src.database.transactions.get_existing_transaction_hashes", return_value=set()), \
             patch("src.database.transactions._insert_transactions_batch", return_value=(txs, set())), \
             patch("src.database.transactions._insert_transactions_individual",
                   return_value=([txs[1]], [], {"new0"})):
            result = insert_transactions(txs)

        assert result.inserted == 1
        assert result.failed == 1


# ── P1-2: total_inserted_amount ───────────────────────────────────────────────

class TestInsertedAmountSum:
    def _run(self, cat_tx, inserted_hashes):
        mock_conn = MagicMock()
        with patch("src.database.connection.get_db_connection", return_value=mock_conn), \
             patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("src.database.transactions.get_existing_transaction_hashes", return_value=set()), \
             patch("src.database.transactions._insert_transactions_batch", return_value=([], inserted_hashes)), \
             patch("src.database.transactions._insert_transactions_individual"):
            return insert_transactions([cat_tx])

    def test_multi_split_amount_is_summed_in_full(self, caplog):
        import logging

        tx = Transaction(
            payment_date=date(2026, 9, 1),
            purchase_date=date(2026, 9, 1),
            payee="Split Payee",
            unique_hash="multi",
            splits=[
                TransactionSplit(amount=Decimal("10.00")),
                TransactionSplit(amount=Decimal("20.00")),
            ],
        )
        cat = CategorizedTransaction(transaction=tx, category_id=1)

        with caplog.at_level(logging.INFO, logger="src.database.db_handler"):
            result = self._run(cat, {"multi"})

        assert result.inserted == 1
        # Old code used splits[0] and would log 10.00 here
        assert "30.00" in caplog.text

    def test_empty_splits_does_not_raise(self):
        tx = Transaction(
            payment_date=date(2026, 9, 1),
            purchase_date=date(2026, 9, 1),
            payee="No Splits",
            unique_hash="empty",
            splits=[],
        )
        cat = CategorizedTransaction(transaction=tx, category_id=1)

        # Old code did splits[0].amount → IndexError
        result = self._run(cat, {"empty"})

        assert result.inserted == 1



class TestInsertedAmountInResult:
    def test_inserted_amount_excludes_duplicates(self):
        txs = [make_cat_tx("new0", "10.00"), make_cat_tx("new1", "5.50"), make_cat_tx("dup0", "100.00")]
        with patch("src.database.connection.get_db_connection", return_value=MagicMock()), \
             patch("src.database.transactions.get_user_id", return_value="user-1"), \
             patch("src.database.transactions.get_existing_transaction_hashes", return_value={"dup0"}), \
             patch("src.database.transactions._insert_transactions_batch", return_value=([], {"new0", "new1"})), \
             patch("src.database.transactions._insert_transactions_individual"):
            result = insert_transactions(txs)

        assert result.inserted_amount == Decimal("15.50")

    def test_inserted_amount_zero_when_nothing_inserted(self):
        result = insert_transactions([])
        assert result.inserted_amount == Decimal(0)

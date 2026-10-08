"""Unit tests for normalizer — payee normalization and unique_hash generation.

The unique_hash is the dedup/idempotency key for the whole importer, so these
tests pin both its stability (same input → same hash) and its sensitivity
(each field change → different hash).
"""

import logging
from datetime import date
from decimal import Decimal

import pytest

from src.processing.normalizer import normalize_payee, normalize_transactions
from src.processing.transaction_model import Transaction, TransactionSplit


def make_tx(**overrides) -> Transaction:
    tx = Transaction(
        payment_date=date(2026, 9, 1),
        purchase_date=date(2026, 9, 1),
        payee="Cafeteria Ni",
        account_id=1,
        statement_identifier="stmt-1",
        splits=[TransactionSplit(amount=Decimal("-10.00"))],
    )
    for key, value in overrides.items():
        if key == "amount":
            tx.splits = [TransactionSplit(amount=value)]
        elif key == "splits":
            tx.splits = value
        else:
            setattr(tx, key, value)
    return tx


def hash_of(tx: Transaction) -> str:
    return normalize_transactions([tx])[0].unique_hash


class TestHashStability:
    def test_same_input_same_hash(self):
        assert hash_of(make_tx()) == hash_of(make_tx())


class TestHashSensitivity:
    @pytest.mark.parametrize("field,value", [
        ("payee", "Other Payee"),
        ("payment_date", date(2026, 9, 2)),
        ("installment_number", 3),
        ("account_id", 2),
        ("statement_identifier", "stmt-2"),
    ])
    def test_field_change_changes_hash(self, field, value):
        assert hash_of(make_tx()) != hash_of(make_tx(**{field: value}))

    def test_amount_change_changes_hash(self):
        assert hash_of(make_tx()) != hash_of(make_tx(amount=Decimal("-10.01")))

    def test_sign_change_changes_hash(self):
        assert hash_of(make_tx(amount=Decimal("10.00"))) != hash_of(make_tx(amount=Decimal("-10.00")))


class TestCollisionCounter:
    def test_three_identical_transactions_get_distinct_hashes(self, caplog):
        txs = [make_tx(), make_tx(), make_tx()]

        with caplog.at_level(logging.WARNING, logger="src.processing.normalizer"):
            normalize_transactions(txs)

        hashes = [tx.unique_hash for tx in txs]
        assert len(set(hashes)) == 3  # base, base+"_1", base+"_2"
        # Two collisions → two warnings
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 2

    def test_non_colliding_transactions_keep_base_hash(self):
        tx1 = make_tx()
        tx2 = make_tx(payee="Another Payee")
        normalize_transactions([tx1, tx2])
        assert tx1.unique_hash != tx2.unique_hash


class TestAmountFormatting:
    def test_two_decimal_amounts_collapse(self):
        # f"{amount:.2f}" rounds 10.001 → "10.00", so these share a base hash.
        # Documented/expected behavior (dedup tolerance at cent level).
        assert hash_of(make_tx(amount=Decimal("10.00"))) == hash_of(make_tx(amount=Decimal("10.001")))

    def test_empty_splits_does_not_break(self):
        tx = make_tx(splits=[])
        assert hash_of(tx)  # amount == 0 → hashes fine, no IndexError


class TestNormalizeTransactionsEdge:
    def test_empty_list_returns_empty(self):
        assert normalize_transactions([]) == []


class TestNormalizePayee:
    def test_empty_returns_unknown(self):
        assert normalize_payee("") == "Unknown Payee"

    def test_none_returns_unknown(self):
        assert normalize_payee(None) == "Unknown Payee"

    def test_normal_payee_unchanged(self):
        # Payee normalization is intentionally bypassed (DO NOT CHANGE)
        assert normalize_payee("Uber   TRIP") == "Uber   TRIP"

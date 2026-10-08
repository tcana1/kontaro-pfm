"""Characterization tests for get_installment_categories_batch (R3).

Captures today's behavior before the refactor: Python-side re-match of the
batch SQL results (payee lower-case equality, ±1 day date proximity, amount
within margin) and the output key format f"{payee.lower()}_{purchase_date}_{amount}".
The SQL itself (consistency filter) is out of scope here.
"""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from src.database.db_handler import get_installment_categories_batch

MARGIN = 0.05


def item(payee="Acme Store", purchase_date=None, amount="25.00"):
    return {
        "payee": payee,
        "purchase_date": purchase_date or date(2026, 9, 10),
        "amount": Decimal(amount),
    }


def installed(rows):
    """Build mocked connection whose cursor.fetchall() returns `rows`."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = rows
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    return mock_conn


def run(data, rows):
    with patch("src.database.installments.get_user_id", return_value="user-1"), \
         patch("src.database.connection.get_db_connection", return_value=installed(rows)):
        return get_installment_categories_batch(data, margin=MARGIN)


class TestBatchInstallmentCategories:
    def test_empty_input_returns_empty_dict(self):
        assert run([], []) == {}

    def test_single_consistent_match(self):
        rows = [("acme store", date(2026, 9, 10), Decimal("25.00"), 42)]
        result = run([item()], rows)
        assert result == {"acme store_2026-09-10_25.00": 42}

    def test_date_proximity_one_day_matches(self):
        rows = [("acme store", date(2026, 9, 9), Decimal("25.00"), 7)]
        result = run([item()], rows)
        assert result["acme store_2026-09-10_25.00"] == 7

    def test_date_beyond_one_day_is_ignored(self):
        rows = [("acme store", date(2026, 9, 5), Decimal("25.00"), 7)]
        result = run([item()], rows)
        assert result == {"acme store_2026-09-10_25.00": None}

    def test_amount_outside_margin_is_ignored(self):
        rows = [("acme store", date(2026, 9, 10), Decimal("26.00"), 7)]
        result = run([item()], rows)
        assert result == {"acme store_2026-09-10_25.00": None}

    def test_payee_mismatch_is_ignored(self):
        rows = [("other store", date(2026, 9, 10), Decimal("25.00"), 7)]
        result = run([item()], rows)
        assert result == {"acme store_2026-09-10_25.00": None}

    def test_first_match_wins_when_multiple_rows(self):
        rows = [
            ("acme store", date(2026, 9, 10), Decimal("25.00"), 42),
            ("acme store", date(2026, 9, 9), Decimal("25.00"), 43),
        ]
        result = run([item()], rows)
        assert result == {"acme store_2026-09-10_25.00": 42}

    def test_input_payee_uppercased_does_not_change_key_case(self):
        rows = [("acme store", date(2026, 9, 10), Decimal("25.00"), 42)]
        for_entry = item(payee="ACME STORE")
        result = run([for_entry], rows)
        assert result == {"acme store_2026-09-10_25.00": 42}

    def test_negative_amount_matches(self):
        rows = [("acme store", date(2026, 9, 10), Decimal("-25.00"), 42)]
        result = run([item(amount="-25.00")], rows)
        assert result == {"acme store_2026-09-10_-25.00": 42}

    def test_multiple_items_are_matched_back(self):
        rows = [
            ("acme store", date(2026, 9, 10), Decimal("25.00"), 42),
            ("beta shop", date(2026, 8, 1), Decimal("9.90"), 11),
        ]
        result = run(
            [item(), item(payee="beta shop", purchase_date=date(2026, 8, 1), amount="9.90")],
            rows,
        )
        assert result == {
            "acme store_2026-09-10_25.00": 42,
            "beta shop_2026-08-01_9.90": 11,
        }

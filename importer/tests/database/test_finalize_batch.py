from decimal import Decimal
from unittest.mock import MagicMock, patch

from src.database.batches import finalize_import_batch


def _finalize(**kwargs):
    cur = MagicMock()
    ctx = MagicMock()
    ctx.__enter__.return_value = cur
    with patch("src.database.batches.db_cursor", return_value=ctx):
        finalize_import_batch("batch-1", 2, 0, **kwargs)
    return cur.execute.call_args[0][1]


def test_total_amount_passed_to_update():
    params = _finalize(total_amount=Decimal("15.50"))
    assert Decimal("15.50") in params


def test_total_amount_defaults_to_none_so_column_is_kept():
    params = _finalize()
    assert params[-2] is None

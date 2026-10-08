"""Status/flag mapping in excel_to_postgres, using synthetic in-memory workbooks.

Lives outside tests/real-data (which is gitignored) so it runs in CI without
any real-data sample file.
"""
import io
from datetime import date
from unittest.mock import patch

import openpyxl
import pytest

from src.utils import excel_to_postgres


def _make_xlsx(headers: list, rows: list, sheet_name: str = 'Sheet1') -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


@patch('src.utils.excel_to_postgres.db_handler')
@patch('src.utils.excel_to_postgres.normalizer')
def test_ignored_status_sets_is_ignored_flag(mock_normalizer, mock_db_handler):
    xlsx = _make_xlsx(
        ['Account', 'Date', 'Payee', 'Category', 'Amount', 'Status'],
        [
            ['Test Account', date(2023, 1, 1), 'Ignored Payee', 'TestGroup:TestCategory', -10.0, 'ignored'],
            ['Test Account', date(2023, 1, 2), 'Normal Payee', 'TestGroup:TestCategory', -20.0, 'pending'],
        ],
    )
    mock_db_handler.get_or_create_accounts_bulk.return_value = ({'Test Account': 1}, [])
    mock_db_handler.get_or_create_categories_bulk.return_value = {'TestGroup:TestCategory': 2}

    def mock_normalize(txs):
        for i, tx in enumerate(txs):
            tx.unique_hash = f"test_hash_{i}"
        return txs
    mock_normalizer.normalize_transactions.side_effect = mock_normalize

    result, _, _, _ = excel_to_postgres.process_excel_file(xlsx, sheet_name='Sheet1')
    assert len(result) == 2

    ignored = next(ct for ct in result if ct.transaction.payee == 'Ignored Payee')
    normal = next(ct for ct in result if ct.transaction.payee == 'Normal Payee')
    # 'ignored' sets the orthogonal flag but leaves the review status at Pending.
    assert ignored.transaction.is_ignored is True
    assert ignored.transaction.status_id == 1
    assert normal.transaction.is_ignored is False


def test_wrong_headers_error_lists_missing_expected_and_found():
    xlsx = _make_xlsx(
        ['Conta', 'Data', 'Beneficiário', 'Grupo/Categoria', 'Valor'],
        [['Test Account', date(2023, 1, 1), 'Test Payee', 'G:C', 100.0]],
    )
    with pytest.raises(ValueError) as exc:
        excel_to_postgres.process_excel_file(xlsx, sheet_name='Sheet1')
    msg = str(exc.value)
    assert "Missing: Account, Date, Payee, Category, Amount." in msg
    assert "Expected: Account, Date, Payee, Category, Amount." in msg
    assert "Found in your file: Conta, Data, Beneficiário, Grupo/Categoria, Valor." in msg


def test_partial_missing_headers_only_lists_missing_ones():
    xlsx = _make_xlsx(
        ['Account', 'Payee', 'Category', 'Amount'],
        [['Test Account', 'Test Payee', 'G:C', 100.0]],
    )
    with pytest.raises(ValueError, match=r"Missing: Date\. Expected:"):
        excel_to_postgres.process_excel_file(xlsx, sheet_name='Sheet1')

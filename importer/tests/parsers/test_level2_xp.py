import os
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from src.parsers import xp_parser
from tests.parsers.fixture_helpers import FIXTURES_DIR, load_page_texts, make_mock_pdf

# Deliberately not the fixtures' year: the parser must read the year off the
# statement, so a wrong "today" must not move any date. Reprocessing an old
# statement used to shift every transaction into the current year.
_MOCK_NOW_WRONG_YEAR = datetime(2029, 6, 1, 10, 0, 0)


def test_xp_basico():
    fixture_dir = os.path.join(FIXTURES_DIR, 'xp_basico')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = xp_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 3

    iof = next(t for t in transactions if t.payee == 'IOF Transacoes Exterior R$')
    assert iof.splits[0].amount == Decimal('-5.00')
    assert iof.purchase_date == date(2021, 1, 6)
    assert iof.splits[0].notes is None

    streaming = next(t for t in transactions if t.payee == 'STREAMING LAMBDA')
    assert streaming.splits[0].amount == Decimal('-100.00')
    assert streaming.purchase_date == date(2021, 1, 6)
    assert streaming.splits[0].notes == 'USD $ 20.00'

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-50.00')
    assert cafeteria.purchase_date == date(2021, 1, 8)
    assert cafeteria.splits[0].notes is None

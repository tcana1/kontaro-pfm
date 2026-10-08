import os
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from src.parsers import btg_parser
from tests.parsers.fixture_helpers import FIXTURES_DIR, load_page_texts, make_mock_pdf

# Deliberately not the fixtures' year: the parser must read the year off the
# "fatura de <month> de <year>" header, so a wrong "today" must not move any date.
# These used to be per-fixture (Feb/Oct 2021) to make today-based inference land
# on the right year — the statement header is the anchor now.
_MOCK_NOW_WRONG_YEAR = datetime(2029, 6, 1, 10, 0, 0)


def test_btg_basico_credito_e_debito():
    fixture_dir = os.path.join(FIXTURES_DIR, 'btg_basico')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = btg_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 3

    cashback = next(t for t in transactions if 'Cashback' in t.payee)
    assert cashback.splits[0].amount == Decimal('20.00')
    assert cashback.purchase_date == date(2021, 1, 25)

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-100.00')
    assert cafeteria.purchase_date == date(2021, 1, 20)

    loja = next(t for t in transactions if t.payee == 'LOJA ALFA')
    assert loja.splits[0].amount == Decimal('-50.00')
    assert loja.purchase_date == date(2021, 1, 21)


def test_btg_fx():
    fixture_dir = os.path.join(FIXTURES_DIR, 'btg_fx')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = btg_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 1
    tx = transactions[0]
    assert tx.payee == 'SERVICO EXTERIOR'
    assert tx.splits[0].amount == Decimal('-137.50')
    assert tx.purchase_date == date(2021, 1, 14)
    assert tx.splits[0].notes == 'USD $ 25,00 @ R$ 5,50'


def test_btg_dois_cols_com_parcela():
    fixture_dir = os.path.join(FIXTURES_DIR, 'btg_dois_cols')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = btg_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 2

    mercado = next(t for t in transactions if t.payee == 'MERCADO ALFA')
    assert mercado.splits[0].amount == Decimal('-78.48')
    assert mercado.purchase_date == date(2021, 8, 19)
    assert mercado.payment_date == date(2021, 8, 19)
    assert mercado.installment_number == 1
    assert mercado.installment_total == 7

    loja = next(t for t in transactions if t.payee == 'LOJA BETA')
    assert loja.splits[0].amount == Decimal('-50.00')
    assert loja.purchase_date == date(2021, 9, 4)
    assert loja.payment_date == date(2021, 8, 15)
    assert loja.installment_number == 3
    assert loja.installment_total == 7

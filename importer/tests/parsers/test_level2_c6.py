import os
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from src.parsers import c6_parser
from tests.parsers.fixture_helpers import FIXTURES_DIR, load_page_texts, make_mock_pdf

# Deliberately not the fixtures' year: the parser must read the year off the
# statement's fechamento line, so a wrong "today" must not move any date.
_MOCK_NOW_WRONG_YEAR = datetime(2029, 6, 1, 10, 0, 0)


def test_c6_basico_parcela_e_regular():
    fixture_dir = os.path.join(FIXTURES_DIR, 'c6_basico')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = c6_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 2

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-100.00')
    assert cafeteria.purchase_date == date(2021, 3, 10)
    assert cafeteria.payment_date == date(2021, 5, 1)
    assert cafeteria.installment_number == 3
    assert cafeteria.installment_total == 10
    assert cafeteria.splits[0].notes == 'Parcela 3/10'

    loja = next(t for t in transactions if t.payee == 'LOJA ALFA')
    assert loja.splits[0].amount == Decimal('-150.00')
    assert loja.purchase_date == date(2021, 5, 28)
    assert loja.payment_date == date(2021, 5, 28)
    assert loja.installment_number is None


def test_c6_estorno():
    fixture_dir = os.path.join(FIXTURES_DIR, 'c6_estorno')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = c6_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 1
    tx = transactions[0]
    assert tx.payee == 'LOJA ALFA estorno'
    assert tx.splits[0].amount == Decimal('100.00')
    assert tx.purchase_date == date(2021, 5, 15)


def test_c6_fx():
    fixture_dir = os.path.join(FIXTURES_DIR, 'c6_fx')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = c6_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 1
    tx = transactions[0]
    assert tx.payee == 'SERVICO EXTERIOR'
    assert tx.splits[0].amount == Decimal('-137.50')
    assert tx.purchase_date == date(2021, 1, 15)
    assert tx.splits[0].notes == 'USD 25.00 @ R$5,50'

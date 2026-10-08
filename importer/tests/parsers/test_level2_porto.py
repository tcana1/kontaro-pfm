import os
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from src.parsers import porto_parser
from tests.parsers.fixture_helpers import FIXTURES_DIR, load_page_texts, make_mock_pdf

# Deliberately not the fixtures' year: the parser must anchor on the statement's
# "previsão de fechamento" date, so a wrong "today" must not move any date.
_MOCK_NOW_WRONG_YEAR = datetime(2029, 6, 1, 10, 0, 0)


def test_porto_basico_installment_regular():
    fixture_dir = os.path.join(FIXTURES_DIR, 'porto_basico')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = porto_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 3

    loja = next(t for t in transactions if t.payee == 'LOJA ALFA')
    assert loja.splits[0].amount == Decimal('-100.00')
    assert loja.purchase_date == date(2021, 2, 6)
    assert loja.payment_date == date(2021, 2, 6)
    assert loja.installment_number == 1
    assert loja.installment_total == 3
    assert loja.splits[0].notes == 'Parcela 01/03'

    mercado = next(t for t in transactions if t.payee == 'MERCADO BETA')
    assert mercado.splits[0].amount == Decimal('-90.00')
    assert mercado.purchase_date == date(2021, 3, 24)
    assert mercado.payment_date == date(2021, 5, 1)
    assert mercado.installment_number == 3
    assert mercado.installment_total == 6
    assert mercado.splits[0].notes == 'Parcela 03/06'

    restaurante = next(t for t in transactions if t.payee == 'RESTAURANTE GAMA')
    assert restaurante.splits[0].amount == Decimal('-150.00')
    assert restaurante.purchase_date == date(2021, 5, 5)
    assert restaurante.payment_date == date(2021, 5, 5)
    assert restaurante.installment_number is None


def test_porto_pa_parcela():
    fixture_dir = os.path.join(FIXTURES_DIR, 'porto_pa_parcela')
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt:
        mock_dt.now.return_value = _MOCK_NOW_WRONG_YEAR
        transactions = porto_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 2

    seguro = next(t for t in transactions if t.payee == 'SEGURO DELTA')
    assert seguro.splits[0].amount == Decimal('-250.00')
    assert seguro.purchase_date == date(2021, 2, 6)
    assert seguro.payment_date == date(2021, 5, 1)
    assert seguro.installment_number == 4
    assert seguro.installment_total is None
    assert seguro.splits[0].notes == 'Parcela ?/04'

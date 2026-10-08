import os
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

from src.parsers import itau_parser
from tests.parsers.fixture_helpers import FIXTURES_DIR, load_page_texts, make_mock_pdf

_MOCK_JUL2021 = datetime(2021, 7, 1, 10, 0, 0)


def _run(fixture_name, mock_date=_MOCK_JUL2021):
    fixture_dir = os.path.join(FIXTURES_DIR, fixture_name)
    pages = load_page_texts(fixture_dir)
    mock_pdf = make_mock_pdf(pages)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch('src.utils.date_utils.datetime', wraps=datetime) as mock_dt_utils, \
         patch('src.parsers.itau_parser.datetime', wraps=datetime) as mock_dt_itau:
        mock_dt_utils.now.return_value = mock_date
        mock_dt_itau.now.return_value = mock_date
        return itau_parser.extract_transactions_from_pdf('/fake/path.pdf')


def test_itau_basico_duas_colunas():
    transactions = _run('itau_basico')

    assert len(transactions) == 4
    payees = {t.payee for t in transactions}
    assert {'CAFETERIA NI', 'MERCADO BETA', 'LOJA ALFA', 'RESTAURANTE GAMA'} == payees

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-100.00')
    assert cafeteria.purchase_date == date(2021, 1, 5)
    assert cafeteria.statement_identifier == '01/05/2021'

    loja = next(t for t in transactions if t.payee == 'LOJA ALFA')
    assert loja.splits[0].amount == Decimal('-200.00')
    assert loja.purchase_date == date(2021, 1, 10)


def test_itau_stop_esquerdo_captura_so_coluna_esquerda():
    transactions = _run('itau_stop_esquerdo')

    assert len(transactions) == 2
    payees = {t.payee for t in transactions}
    assert payees == {'CAFETERIA NI', 'MERCADO BETA'}


def test_itau_stop_direito_captura_ambas_colunas():
    transactions = _run('itau_stop_direito')

    assert len(transactions) == 5
    payees = {t.payee for t in transactions}
    assert {'CAFETERIA NI', 'MERCADO BETA', 'FARMACIA DELTA', 'LOJA ALFA', 'RESTAURANTE GAMA'} == payees


def test_itau_parcela():
    transactions = _run('itau_parcela')

    assert len(transactions) == 2

    loja = next(t for t in transactions if t.payee == 'LOJA ALFA')
    assert loja.splits[0].amount == Decimal('-500.00')
    assert loja.purchase_date == date(2021, 1, 5)
    assert loja.payment_date == date(2021, 5, 1)
    assert loja.installment_number == 3
    assert loja.installment_total == 10
    assert loja.splits[0].notes == 'Parcela 03/10'

    mercado = next(t for t in transactions if t.payee == 'MERCADO BETA')
    assert mercado.splits[0].amount == Decimal('-200.00')
    assert mercado.purchase_date == date(2021, 1, 10)
    assert mercado.payment_date == date(2021, 1, 10)
    assert mercado.installment_number is None


def test_itau_iof():
    transactions = _run('itau_iof')

    iof = next((t for t in transactions if t.payee == 'Repasse de IOF'), None)
    assert iof is not None
    assert iof.splits[0].amount == Decimal('-13.20')
    assert iof.payment_date == date(2021, 5, 1)
    assert iof.purchase_date == date(2021, 5, 1)

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-100.00')

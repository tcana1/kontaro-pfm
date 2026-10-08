import os
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from src.parsers import c6_global_eur_parser, c6_global_usd_parser
from tests.parsers.fixture_helpers import (
    FIXTURES_DIR,
    load_page_tables,
    load_page_texts,
    make_mock_pdf,
)


def test_c6_global_eur_basico():
    fixture_dir = os.path.join(FIXTURES_DIR, 'c6_global_eur_basico')
    pages = load_page_texts(fixture_dir)
    tables = load_page_tables(fixture_dir)
    mock_pdf = make_mock_pdf(pages, tables)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch.dict('os.environ', {}, clear=False):
        transactions = c6_global_eur_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 2

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-100.00')
    assert cafeteria.purchase_date == date(2021, 5, 14)
    assert cafeteria.payment_date == date(2021, 5, 14)
    assert cafeteria.splits[0].notes == 'EUR -100.00'
    assert cafeteria.statement_identifier == '31/05/2021'

    loja = next(t for t in transactions if t.payee == 'LOJA ALFA')
    assert loja.splits[0].amount == Decimal('-50.00')
    assert loja.purchase_date == date(2021, 5, 16)
    assert loja.splits[0].notes == 'EUR -50.00'


def test_c6_global_eur_skips_em_processamento():
    fixture_dir = os.path.join(FIXTURES_DIR, 'c6_global_eur_basico')
    pages = load_page_texts(fixture_dir)
    tables = load_page_tables(fixture_dir)
    mock_pdf = make_mock_pdf(pages, tables)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch.dict('os.environ', {}, clear=False):
        transactions = c6_global_eur_parser.extract_transactions('/fake/path.pdf')

    payees = [t.payee for t in transactions]
    assert 'SERVICO PENDENTE' not in payees


def test_c6_global_usd_basico():
    fixture_dir = os.path.join(FIXTURES_DIR, 'c6_global_usd_basico')
    pages = load_page_texts(fixture_dir)
    tables = load_page_tables(fixture_dir)
    mock_pdf = make_mock_pdf(pages, tables)

    with patch('pdfplumber.open', return_value=mock_pdf), \
         patch.dict('os.environ', {}, clear=False):
        transactions = c6_global_usd_parser.extract_transactions('/fake/path.pdf')

    assert len(transactions) == 1

    cafeteria = next(t for t in transactions if t.payee == 'CAFETERIA NI')
    assert cafeteria.splits[0].amount == Decimal('-50.00')
    assert cafeteria.purchase_date == date(2021, 3, 14)
    assert cafeteria.payment_date == date(2021, 3, 14)
    assert cafeteria.splits[0].notes == 'USD -50.00'
    assert cafeteria.statement_identifier == '31/03/2021'

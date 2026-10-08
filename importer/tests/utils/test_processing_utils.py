from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from src.exceptions import EmptyStatementError, ParserError
from src.processing.transaction_model import Transaction, TransactionSplit
from src.utils.processing_utils import process_statement_file

_FILE_INFO_ITAU = {
    "bank": "itau",
    "type": "credit_card",
    "format": "pdf",
    "text": "fatura itau",
}

_SAMPLE_TX = Transaction(
    payment_date=date(2024, 7, 1),
    purchase_date=date(2024, 6, 30),
    payee="Mercado",
    splits=[TransactionSplit(amount=Decimal("42.00"))],
)


def _patch_identification(file_info=None):
    return patch(
        "src.utils.processing_utils.file_identifier.identify_file",
        return_value=file_info or _FILE_INFO_ITAU,
    )


def _patch_account(account_id=1):
    return patch(
        "src.utils.processing_utils.db_handler.get_account_name_by_id",
        return_value="Test Account",
    )


def _patch_password(password=""):
    return patch(
        "src.utils.processing_utils.file_identifier.find_pdf_password",
        return_value=password,
    )


def _patch_pdf_passwords():
    return patch(
        "src.utils.processing_utils.db_handler.get_pdf_passwords_plaintext",
        return_value=[],
    )


def _patch_pipeline(categorized=None):
    result = MagicMock()
    result.categorized = categorized or []
    return patch("src.utils.processing_utils.run_pipeline", return_value=result)


@patch("src.utils.processing_utils.itau_parser.extract_transactions_from_pdf", return_value=[_SAMPLE_TX])
def test_returns_categorized_on_success(mock_parser):
    cat_tx = MagicMock()
    with _patch_pdf_passwords(), _patch_identification(), _patch_account(), _patch_password(), _patch_pipeline([cat_tx]):
        result = process_statement_file("fake.pdf", account_id_override=1)
    assert result == [cat_tx]


@patch("src.utils.processing_utils.itau_parser.extract_transactions_from_pdf", return_value=[])
def test_empty_parser_result_raises_empty_statement_error(mock_parser):
    with _patch_pdf_passwords(), _patch_identification(), _patch_account(), _patch_password():
        with pytest.raises(EmptyStatementError):
            process_statement_file("fake.pdf", account_id_override=1)


@patch("src.utils.processing_utils.itau_parser.extract_transactions_from_pdf", side_effect=RuntimeError("unexpected crash"))
def test_unexpected_parser_exception_raises_parser_error(mock_parser):
    with _patch_pdf_passwords(), _patch_identification(), _patch_account(), _patch_password(), \
         patch("src.utils.processing_utils.db_handler.create_and_fail_batch"):
        with pytest.raises(ParserError):
            process_statement_file("fake.pdf", account_id_override=1)


@patch("src.utils.processing_utils.itau_parser.extract_transactions_from_pdf", side_effect=ValueError("bad value"))
def test_value_error_from_parser_propagates_as_value_error(mock_parser):
    """ValueError from parsers (e.g. unsupported layout signals) must not be swallowed."""
    with _patch_pdf_passwords(), _patch_identification(), _patch_account(), _patch_password(), \
         patch("src.utils.processing_utils.db_handler.create_and_fail_batch"):
        with pytest.raises(ValueError):
            process_statement_file("fake.pdf", account_id_override=1)


def test_unknown_bank_raises_value_error():
    file_info = {**_FILE_INFO_ITAU, "bank": "unknown_bank"}
    with _patch_pdf_passwords(), _patch_identification(file_info), _patch_account(), _patch_password(), \
         patch("src.utils.processing_utils.db_handler.create_and_fail_batch"):
        with pytest.raises(ValueError, match="Unsupported or unknown bank"):
            process_statement_file("fake.pdf", account_id_override=1)

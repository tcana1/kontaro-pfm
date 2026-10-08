# tests/test_app.py
import hashlib
import os
from datetime import date
from decimal import Decimal
from unittest.mock import ANY, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app import app
from src.config import MAX_FILE_SIZE_BYTES
from src.exceptions import ParserError, UnsupportedLayoutError
from src.processing.transaction_model import (
    CategorizedTransaction,
    Transaction,
    TransactionSplit,
)

_TEST_API_KEY = "test_api_key"
_TEST_KEY_HASH = hashlib.sha256(_TEST_API_KEY.encode()).hexdigest()


def _resolve_user(key_hash: str):
    return "test-user-id" if key_hash == _TEST_KEY_HASH else None


@pytest.fixture(scope="module")
def pdf_file(tmp_path_factory):
    p = tmp_path_factory.mktemp("pdf") / "sample.pdf"
    p.write_bytes(b"%PDF-1.4\n%%EOF\n")
    return p


@pytest.fixture(scope="module")
def test_client():
    with patch("src.auth.db_handler.resolve_user_id_from_key_hash", side_effect=_resolve_user):
        with TestClient(app) as client:
            yield client


@pytest.fixture
def mock_run_pipeline_success(tmp_path):
    with patch('src.routes.statements.process_statement_file') as mock_process_statement_file, \
         patch('src.output.excel_writer.save_to_excel') as mock_save_to_excel, \
         patch('src.output.csv_writer.save_to_csv') as mock_save_to_csv, \
         patch('src.routes.statements.tempfile.mkdtemp') as mock_mkdtemp:
        mock_tx1 = Transaction(
            payment_date=date(2024, 1, 1),
            purchase_date=date(2023, 12, 31),
            payee="Mock Payee 1",
            splits=[TransactionSplit(amount=Decimal("100.00"))]
        )
        mock_tx2 = Transaction(
            payment_date=date(2024, 1, 2),
            purchase_date=date(2024, 1, 1),
            payee="Mock Payee 2",
            splits=[TransactionSplit(amount=Decimal("50.00"))]
        )
        mock_process_statement_file.return_value = [
            CategorizedTransaction(transaction=mock_tx1, category_id=1),
            CategorizedTransaction(transaction=mock_tx2, category_id=2),
        ]

        mock_mkdtemp.return_value = str(tmp_path)

        def _mock_save_to_excel(transactions, output_filepath):
            os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
            with open(output_filepath, "w") as f:
                f.write("dummy excel content")
            return output_filepath
        mock_save_to_excel.side_effect = _mock_save_to_excel

        def _mock_save_to_csv(transactions, output_path):
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "w") as f:
                f.write("dummy csv content")
            return output_path
        mock_save_to_csv.side_effect = _mock_save_to_csv

        yield mock_process_statement_file


@pytest.fixture
def mock_run_pipeline_empty():
    with patch('src.routes.statements.process_statement_file') as mock_process_statement_file:
        mock_process_statement_file.return_value = []
        yield mock_process_statement_file

@pytest.fixture
def mock_run_pipeline_exception():
    with patch('src.routes.statements.process_statement_file') as mock_process_statement_file:
        mock_process_statement_file.side_effect = Exception("Simulated pipeline error")
        yield mock_process_statement_file

@pytest.fixture
def mock_run_pipeline_timeout():
    with patch('src.routes.statements.process_statement_file') as mock_process_statement_file:
        def long_running_pipeline(*args, **kwargs):
            import time
            time.sleep(0.1)
            mock_tx = Transaction(
                payment_date=date(2024, 1, 1),
                purchase_date=date(2023, 12, 31),
                payee="Timeout Payee",
                splits=[TransactionSplit(amount=Decimal("10.00"))]
            )
            return [CategorizedTransaction(transaction=mock_tx, category_id=1)]
        mock_process_statement_file.side_effect = long_running_pipeline
        yield mock_process_statement_file


def create_dummy_file(filepath, size_bytes=100, content_type="application/pdf"):
    with open(filepath, "wb") as f:
        f.write(b"\0" * size_bytes)
    return filepath


async def test_process_statement_success_excel_output(mock_run_pipeline_success, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "excel"},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 200
    assert response.headers['content-type'] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "filename=" in response.headers['content-disposition'] and "processed_statement" in response.headers['content-disposition']

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_success_json_output(mock_run_pipeline_success, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "json"},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 200
    assert response.headers['content-type'] == "application/json"

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    data = response.json()
    assert data['success']
    assert data['transaction_count'] == 2
    assert data['total_amount'] == 150.0
    assert data['message'] == "Processing successful"
    assert 'data' in data
    assert 'transactions' in data['data']
    assert isinstance(data['data']['transactions'], list)
    assert len(data['data']['transactions']) == 2
    assert data['data']['transactions'][0]['payee'] == "Mock Payee 1"

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_success_csv_output(mock_run_pipeline_success, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "csv"},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 200
    assert response.headers['content-type'] == "text/csv; charset=utf-8"
    assert "filename=" in response.headers['content-disposition'] and "processed_statement" in response.headers['content-disposition']

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_success_multiple_output_json_present(mock_run_pipeline_success, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "excel,json"},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 200
    assert response.headers['content-type'] == "application/json"

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    data = response.json()
    assert data['success']
    assert data['transaction_count'] == 2
    assert data['total_amount'] == 150.0
    assert data['message'] == "Processing successful. Generated 1 additional file format(s)."
    assert 'data' in data
    assert 'transactions' in data['data']
    assert isinstance(data['data']['transactions'], list)
    assert len(data['data']['transactions']) == 2

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_success_multiple_output_no_json(mock_run_pipeline_success, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "excel,csv"},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 200
    assert response.headers['content-type'] == "application/json"

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    data = response.json()
    assert data['success']
    assert data['transaction_count'] == 2
    assert data['total_amount'] == 150.0
    assert data['message'] == "Processing successful. Generated 2 file format(s)."
    assert 'data' not in data

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_missing_api_key(pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "json"}
        )
    assert response.status_code == 403

async def test_process_statement_incorrect_api_key(pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "json"},
            headers={"x-api-key": "wrong_api_key"}
        )
    assert response.status_code == 403

async def test_process_statement_invalid_file_type(tmp_path, test_client):
    dummy_file_path = create_dummy_file(tmp_path / "test.txt")
    with open(dummy_file_path, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("test.txt", f, "text/plain")},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 400
    assert "Invalid file extension" in response.json()['detail']

async def test_process_statement_file_too_large(tmp_path, test_client):
    large_file_path = create_dummy_file(tmp_path / "large_file.pdf", size_bytes=MAX_FILE_SIZE_BYTES + 1)
    with open(large_file_path, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("large_file.pdf", f, "application/pdf")},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 413
    assert "File too large" in response.json()['detail']

async def test_process_statement_empty_transactions(mock_run_pipeline_empty, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 200

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "0"
    assert response.headers['X-Total-Amount'] == "0"

    data = response.json()
    assert data['success']
    assert data['transaction_count'] == 0
    assert data['total_amount'] == 0
    assert data['message'] == "No transactions processed."

    mock_run_pipeline_empty.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_pipeline_exception(mock_run_pipeline_exception, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers={"x-api-key": "test_api_key"}
        )
    assert response.status_code == 500

    assert response.headers['X-Success'] == "false"
    assert response.headers['X-Transaction-Count'] == "0"
    assert response.headers['X-Total-Amount'] == "0"

    data = response.json()
    assert not data['success']
    assert data['transaction_count'] == 0
    assert data['total_amount'] == 0
    assert "Internal server error during processing" in data['message']

    mock_run_pipeline_exception.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

@patch('src.routes.statements.PROCESSING_TIMEOUT_SECONDS', 0.05)
async def test_process_statement_timeout(mock_run_pipeline_timeout, pdf_file, test_client):
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers={"x-api-key": "test_api_key"}
        )

    assert response.status_code == 504
    assert "Processing timed out" in response.json()['detail']
    mock_run_pipeline_timeout.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)



async def test_process_statement_headers_only_none_format(mock_run_pipeline_success, pdf_file, test_client):
    """Test headers-only response when output_format is 'none'"""
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "none"},
            headers={"x-api-key": "test_api_key"}
        )

    assert response.status_code == 204
    assert response.content == b""

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_headers_only_missing_format(mock_run_pipeline_success, pdf_file, test_client):
    """Test default behavior when output_format parameter is omitted (should default to excel)"""
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers={"x-api-key": "test_api_key"}
        )

    assert response.status_code == 200
    assert response.headers['content-type'] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "2"
    assert response.headers['X-Total-Amount'] == "150.00"

    mock_run_pipeline_success.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)

async def test_process_statement_headers_only_empty_transactions(mock_run_pipeline_empty, pdf_file, test_client):
    """Test headers-only response with empty transactions list"""
    with open(pdf_file, "rb") as f:
        response = test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            params={"output_format": "none"},
            headers={"x-api-key": "test_api_key"}
        )

    assert response.status_code == 204
    assert response.content == b""

    assert response.headers['X-Success'] == "true"
    assert response.headers['X-Transaction-Count'] == "0"
    assert response.headers['X-Total-Amount'] == "0"

    mock_run_pipeline_empty.assert_called_once_with(file_path=ANY, dry_run=False, account_id_override=None, original_filename=ANY)


# ── /transactions/import tests ──────────────────────────────────────────────

IMPORT_PAYLOAD = {
    "account_slug": "itau-the-one",
    "transactions": [
        {
            "payment_date": "2025-03-15",
            "purchase_date": "2025-03-10",
            "payee": "Uber Trip",
            "splits": [{"amount": "-45.50"}]
        },
        {
            "payment_date": "2025-03-16",
            "purchase_date": "2025-03-16",
            "payee": "iFood",
            "splits": [{"amount": "-82.00"}]
        },
    ]
}


@pytest.fixture
def mock_import_pipeline():
    mock_tx1 = Transaction(
        payment_date=date(2025, 3, 15),
        purchase_date=date(2025, 3, 10),
        payee="Uber Trip",
        splits=[TransactionSplit(amount=Decimal("-45.50"))],
    )
    mock_tx2 = Transaction(
        payment_date=date(2025, 3, 16),
        purchase_date=date(2025, 3, 16),
        payee="iFood",
        splits=[TransactionSplit(amount=Decimal("-82.00"))],
    )
    categorized = [
        CategorizedTransaction(transaction=mock_tx1, category_id=1),
        CategorizedTransaction(transaction=mock_tx2, category_id=2),
    ]
    pipeline_result = MagicMock()
    pipeline_result.categorized = categorized
    pipeline_result.insert_result.inserted = 2
    pipeline_result.insert_result.failed = 0
    with patch("src.services.import_service.db_handler.get_account_id_by_slug_or_fail", return_value=42), \
         patch("src.services.import_service.db_handler.get_existing_transaction_hashes", return_value=set()), \
         patch("src.services.import_service.run_pipeline", return_value=pipeline_result):
        yield


@pytest.fixture
def mock_import_pipeline_with_duplicate():
    mock_tx1 = Transaction(
        payment_date=date(2025, 3, 15),
        purchase_date=date(2025, 3, 10),
        payee="Uber Trip",
        splits=[TransactionSplit(amount=Decimal("-45.50"))],
        unique_hash="abc123",
    )
    mock_tx2 = Transaction(
        payment_date=date(2025, 3, 16),
        purchase_date=date(2025, 3, 16),
        payee="iFood",
        splits=[TransactionSplit(amount=Decimal("-82.00"))],
        unique_hash="def456",
    )
    categorized = [
        CategorizedTransaction(transaction=mock_tx1, category_id=1),
        CategorizedTransaction(transaction=mock_tx2, category_id=2),
    ]
    pipeline_result = MagicMock()
    pipeline_result.categorized = categorized
    pipeline_result.insert_result.inserted = 1
    pipeline_result.insert_result.failed = 0
    with patch("src.services.import_service.db_handler.get_account_id_by_slug_or_fail", return_value=42), \
         patch("src.services.import_service.db_handler.get_existing_transaction_hashes", return_value={"abc123"}), \
         patch("src.services.import_service.run_pipeline", return_value=pipeline_result):
        yield


async def test_import_transactions_success(mock_import_pipeline, test_client):
    response = test_client.post(
        "/transactions/import",
        json=IMPORT_PAYLOAD,
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["transaction_count"] == 2
    assert data["inserted"] == 2
    assert data["duplicates"] == 0
    assert data["failed"] == 0
    assert data["dry_run"] is False
    assert data["total_amount"] == pytest.approx(-127.50)


async def test_import_transactions_dry_run(mock_import_pipeline, test_client):
    payload = {**IMPORT_PAYLOAD, "dry_run": True}
    response = test_client.post(
        "/transactions/import",
        json=payload,
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["dry_run"] is True
    assert data["inserted"] == 2


async def test_import_transactions_with_duplicate(mock_import_pipeline_with_duplicate, test_client):
    response = test_client.post(
        "/transactions/import",
        json=IMPORT_PAYLOAD,
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["transaction_count"] == 2
    assert data["duplicates"] == 1
    assert data["inserted"] == 1


async def test_import_transactions_account_not_found(test_client):
    with patch("src.services.import_service.db_handler.get_account_id_by_slug_or_fail", side_effect=ValueError("Account not found")):
        response = test_client.post(
            "/transactions/import",
            json=IMPORT_PAYLOAD,
            headers={"x-api-key": "test_api_key"},
        )
    assert response.status_code == 404
    assert "Account not found" in response.json()["detail"]


async def test_import_transactions_missing_api_key(test_client):
    response = test_client.post("/transactions/import", json=IMPORT_PAYLOAD)
    assert response.status_code == 403


async def test_import_transactions_wrong_api_key(test_client):
    response = test_client.post(
        "/transactions/import",
        json=IMPORT_PAYLOAD,
        headers={"x-api-key": "wrong_key"},
    )
    assert response.status_code == 403


async def test_import_transactions_empty_list(test_client):
    payload = {**IMPORT_PAYLOAD, "transactions": []}
    response = test_client.post(
        "/transactions/import",
        json=payload,
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 422


async def test_import_transactions_pipeline_error(test_client):
    with patch("src.services.import_service.db_handler.get_account_id_by_slug_or_fail", return_value=42), \
         patch("src.services.import_service.db_handler.get_existing_transaction_hashes", return_value=set()), \
         patch("src.services.import_service.run_pipeline", side_effect=Exception("DB down")):
        response = test_client.post(
            "/transactions/import",
            json=IMPORT_PAYLOAD,
            headers={"x-api-key": "test_api_key"},
        )
    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error during import."


# ── PATCH /transactions/{id}/status ──────────────────────────────────────────


async def test_update_status_pending_to_cleared(test_client):
    with patch("src.routes.transactions.db_handler.update_transaction_status", return_value=True):
        response = test_client.patch(
            "/transactions/42/status",
            json={"status_id": 2},
            headers={"x-api-key": "test_api_key"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["updated"] is True


async def test_update_status_guard_cleared_not_overwritten(test_client):
    with patch("src.routes.transactions.db_handler.update_transaction_status", return_value=False):
        response = test_client.patch(
            "/transactions/42/status",
            json={"status_id": 2},
            headers={"x-api-key": "test_api_key"},
        )
    assert response.status_code == 200
    assert response.json()["updated"] is False


async def test_update_status_posted_id_now_invalid(test_client):
    response = test_client.patch(
        "/transactions/42/status",
        json={"status_id": 3},
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 422


async def test_update_status_invalid_status_id(test_client):
    response = test_client.patch(
        "/transactions/42/status",
        json={"status_id": 999},
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 422


async def test_update_status_wrong_api_key(test_client):
    response = test_client.patch(
        "/transactions/42/status",
        json={"status_id": 2},
        headers={"x-api-key": "wrong_key"},
    )
    assert response.status_code == 403


# ── all-duplicate import in /transactions/import ─────────────────────────────

DUPLICATE_PAYLOAD = {
    "account_slug": "itau-the-one",
    "transactions": [
        {
            "payment_date": "2025-03-15",
            "purchase_date": "2025-03-10",
            "payee": "Uber Trip",
            "status_id": 1,
            "statement_identifier": "pluggy:uuid-001",
            "splits": [{"amount": "-45.50"}],
        },
        {
            "payment_date": "2025-03-16",
            "purchase_date": "2025-03-16",
            "payee": "iFood",
            "status_id": 1,
            "statement_identifier": "pluggy:uuid-002",
            "splits": [{"amount": "-82.00"}],
        },
    ],
}


@pytest.fixture
def mock_import_pipeline_all_duplicate():
    mock_tx1 = Transaction(
        payment_date=date(2025, 3, 15),
        purchase_date=date(2025, 3, 10),
        payee="Uber Trip",
        splits=[TransactionSplit(amount=Decimal("-45.50"))],
        unique_hash="hash-001",
        statement_identifier="pluggy:uuid-001",
        status_id=1,
    )
    mock_tx2 = Transaction(
        payment_date=date(2025, 3, 16),
        purchase_date=date(2025, 3, 16),
        payee="iFood",
        splits=[TransactionSplit(amount=Decimal("-82.00"))],
        unique_hash="hash-002",
        statement_identifier="pluggy:uuid-002",
        status_id=1,
    )
    categorized = [
        CategorizedTransaction(transaction=mock_tx1, category_id=1),
        CategorizedTransaction(transaction=mock_tx2, category_id=2),
    ]
    pipeline_result = MagicMock()
    pipeline_result.categorized = categorized
    pipeline_result.insert_result.inserted = 0
    pipeline_result.insert_result.failed = 0
    with patch("src.services.import_service.db_handler.get_account_id_by_slug_or_fail", return_value=42), \
         patch("src.services.import_service.db_handler.get_existing_transaction_hashes", return_value={"hash-001", "hash-002"}), \
         patch("src.services.import_service.run_pipeline", return_value=pipeline_result):
        yield


async def test_import_all_duplicate_reports_duplicates(mock_import_pipeline_all_duplicate, test_client):
    response = test_client.post(
        "/transactions/import",
        json=DUPLICATE_PAYLOAD,
        headers={"x-api-key": "test_api_key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["inserted"] == 0
    assert data["duplicates"] == 2


# ── R1 contract: pipeline exception → status/detail mapping ──────────────────

async def _post_with_pipeline_exc(exc, test_client, pdf_file):
    with patch("src.routes.statements.process_statement_file", side_effect=exc), \
         open(pdf_file, "rb") as f:
        return test_client.post(
            "/process-statement/",
            files={"file": ("sample.pdf", f, "application/pdf")},
            headers={"x-api-key": "test_api_key"},
        )


async def test_pipeline_unsupported_layout_422(pdf_file, test_client):
    response = await _post_with_pipeline_exc(UnsupportedLayoutError("layout not supported"), test_client, pdf_file)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_layout"
    assert response.json()["detail"]["message"] == "layout not supported"


async def test_pipeline_parser_error_422(pdf_file, test_client):
    response = await _post_with_pipeline_exc(ParserError("parser boom"), test_client, pdf_file)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "parser_failure"
    assert response.json()["detail"]["message"] == "parser boom"


async def test_pipeline_ambiguous_value_error_422_with_file_info(pdf_file, test_client):
    import json
    payload = json.dumps({"bar": ["a", "b"], "name": ["X", "Y"]})
    response = await _post_with_pipeline_exc(ValueError(f"AMBIGUOUS:{payload}"), test_client, pdf_file)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "ambiguous"
    assert detail["file_info"] == {"bar": ["a", "b"], "name": ["X", "Y"]}
    assert "account_id" in detail["message"]


async def test_pipeline_not_found_value_error_422_with_file_info(pdf_file, test_client):
    import json
    payload = json.dumps({"name": ["X"]})
    response = await _post_with_pipeline_exc(ValueError(f"NOT_FOUND:{payload}"), test_client, pdf_file)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "not_found"
    assert detail["file_info"] == {"name": ["X"]}


async def test_pipeline_pdf_password_failed_422(pdf_file, test_client):
    response = await _post_with_pipeline_exc(ValueError("PDF_PASSWORD_FAILED:protected file"), test_client, pdf_file)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "pdf_password_failed"
    assert detail["message"] == "PDF_PASSWORD_FAILED:protected file"

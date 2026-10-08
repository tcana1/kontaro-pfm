"""HTTP-level tests for POST /connectors/{id}/sync — focused on the optional date_from body."""

import hashlib
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import app

_TEST_API_KEY = "test_api_key"
_TEST_KEY_HASH = hashlib.sha256(_TEST_API_KEY.encode()).hexdigest()
_TEST_USER_ID = "test-user-id"


def _resolve_user(key_hash: str):
    return _TEST_USER_ID if key_hash == _TEST_KEY_HASH else None


@pytest.fixture(scope="module")
def test_client():
    with patch("src.auth.db_handler.resolve_user_id_from_key_hash", side_effect=_resolve_user):
        with TestClient(app) as client:
            yield client


def _headers():
    return {"x-api-key": _TEST_API_KEY}


def _connector_row():
    return {
        "id": "conn-1", "client_id": "cid", "client_secret_enc": "enc",
        "timezone": "America/Sao_Paulo", "import_from": None,
    }


@pytest.fixture
def mock_connector_setup():
    with patch("src.routes.connectors.db_handler.get_connector", return_value=_connector_row()), \
         patch("src.routes.connectors.db_handler.get_connector_accounts", return_value=[{"id": 1, "name": "Acct"}]), \
         patch("src.routes.connectors.crypto.decrypt", return_value="secret"), \
         patch("src.routes.connectors.context.get_user_id", return_value=_TEST_USER_ID), \
         patch("src.sources.pluggy.provider.PluggyProvider.__init__", return_value=None), \
         patch("src.sources.pluggy.provider.PluggyProvider.get_api_key", return_value="key"), \
         patch("src.sources.pluggy.sync.sync_account") as mock_sync_account:
        yield mock_sync_account


def test_sync_without_body_passes_no_override(test_client, mock_connector_setup):
    response = test_client.post("/connectors/conn-1/sync", headers=_headers())
    assert response.status_code == 202
    assert response.json() == {"status": "sync_started", "connector_id": "conn-1"}


def test_sync_with_date_from_rejects_future_date(test_client, mock_connector_setup):
    response = test_client.post(
        "/connectors/conn-1/sync", headers=_headers(), json={"date_from": "2099-01-01"}
    )
    assert response.status_code == 422


def test_sync_with_valid_date_from_accepted(test_client, mock_connector_setup):
    response = test_client.post(
        "/connectors/conn-1/sync", headers=_headers(), json={"date_from": "2026-01-15"}
    )
    assert response.status_code == 202


def test_sync_connector_not_found(test_client):
    with patch("src.routes.connectors.db_handler.get_connector", return_value=None):
        response = test_client.post("/connectors/missing/sync", headers=_headers())
    assert response.status_code == 404

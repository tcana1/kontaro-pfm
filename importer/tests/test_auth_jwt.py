# tests/test_auth_jwt.py
"""
Auth tests for the JWT Bearer path in app.py.

The importer supports two auth modes:
  1. x-api-key header  (already covered in test_app.py)
  2. Authorization: Bearer <jwt>  (covered here)

Tests cover: _user_id_from_jwt unit tests, HTTP-level Bearer acceptance/rejection,
dual-mode fallthrough (bad JWT + valid API key), and contextvar propagation.
"""
import hashlib
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

# crypto.py validates SECRETS_ENC_KEY at import time — set before importing app.
os.environ.setdefault("SECRETS_ENC_KEY", "Xw44VqOsq9v4svjthy90BjRwoBFGPbnPmwSVYE2sA3w=")

from app import app  # noqa: E402
from src.auth import _user_id_from_jwt  # noqa: E402

_JWT_SECRET = "test-jwt-secret-for-unit-tests"
_TEST_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_TEST_API_KEY = "test_api_key"
_TEST_KEY_HASH = hashlib.sha256(_TEST_API_KEY.encode()).hexdigest()


def _make_jwt(
    user_id: str = _TEST_USER_ID,
    secret: str = _JWT_SECRET,
    exp_delta: timedelta = timedelta(hours=1),
    audience: str = "authenticated",
    include_sub: bool = True,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict = {"role": "authenticated", "aud": audience, "iat": now, "exp": now + exp_delta}
    if include_sub:
        payload["sub"] = user_id
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ── _user_id_from_jwt unit tests ──────────────────────────────────────────────

def test_valid_hs256_jwt_returns_user_id():
    with patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET):
        assert _user_id_from_jwt(_make_jwt()) == _TEST_USER_ID


def test_expired_jwt_returns_none():
    with patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET):
        assert _user_id_from_jwt(_make_jwt(exp_delta=timedelta(hours=-1))) is None


def test_wrong_secret_returns_none():
    with patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET):
        assert _user_id_from_jwt(_make_jwt(secret="attacker-secret")) is None


def test_wrong_audience_returns_none():
    with patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET):
        assert _user_id_from_jwt(_make_jwt(audience="service_role")) is None


def test_missing_sub_returns_none():
    with patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET):
        assert _user_id_from_jwt(_make_jwt(include_sub=False)) is None


def test_no_secret_and_no_jwks_returns_none():
    with patch("src.auth._SUPABASE_JWT_SECRET", ""), patch("src.auth._jwks_client", None):
        assert _user_id_from_jwt(_make_jwt()) is None


def test_malformed_token_returns_none():
    with patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET):
        assert _user_id_from_jwt("not.a.jwt") is None


# ── HTTP Bearer tests via GET /import-rules (simplest authenticated endpoint) ─

@pytest.fixture
def jwt_client():
    with (
        patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET),
        patch("src.routes.file_settings.db_handler.list_import_rules", return_value=[]),
    ):
        with TestClient(app) as client:
            yield client


def test_valid_bearer_token_is_accepted(jwt_client):
    r = jwt_client.get("/import-rules", headers={"Authorization": f"Bearer {_make_jwt()}"})
    assert r.status_code == 200


def test_expired_bearer_token_is_rejected(jwt_client):
    r = jwt_client.get(
        "/import-rules",
        headers={"Authorization": f"Bearer {_make_jwt(exp_delta=timedelta(hours=-1))}"},
    )
    assert r.status_code == 403


def test_bearer_with_wrong_secret_is_rejected(jwt_client):
    r = jwt_client.get(
        "/import-rules",
        headers={"Authorization": f"Bearer {_make_jwt(secret='attacker-secret')}"},
    )
    assert r.status_code == 403


def test_bearer_with_wrong_audience_is_rejected(jwt_client):
    r = jwt_client.get(
        "/import-rules",
        headers={"Authorization": f"Bearer {_make_jwt(audience='service_role')}"},
    )
    assert r.status_code == 403


# ── Dual-mode: bad JWT falls through to API key ───────────────────────────────

def test_bad_jwt_plus_valid_api_key_succeeds():
    """Invalid Bearer token must not block a valid x-api-key on the same request."""
    bad_token = pyjwt.encode({"sub": "x"}, "wrong-secret", algorithm="HS256")

    def _resolver(key_hash: str):
        return _TEST_USER_ID if key_hash == _TEST_KEY_HASH else None

    with (
        patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET),
        patch("src.auth.db_handler.resolve_user_id_from_key_hash", side_effect=_resolver),
        patch("src.routes.file_settings.db_handler.list_import_rules", return_value=[]),
    ):
        with TestClient(app) as client:
            r = client.get(
                "/import-rules",
                headers={"Authorization": f"Bearer {bad_token}", "x-api-key": _TEST_API_KEY},
            )
    assert r.status_code == 200


# ── Contextvar propagation ────────────────────────────────────────────────────

def test_bearer_auth_sets_user_id_in_context():
    """Valid JWT must populate the request-scoped user_id contextvar."""
    captured: list[str] = []

    def _mock_list():
        from src import context
        captured.append(context.get_user_id())
        return []

    with (
        patch("src.auth._SUPABASE_JWT_SECRET", _JWT_SECRET),
        patch("src.routes.file_settings.db_handler.list_import_rules", side_effect=_mock_list),
    ):
        with TestClient(app) as client:
            client.get("/import-rules", headers={"Authorization": f"Bearer {_make_jwt()}"})

    assert len(captured) == 1
    assert captured[0] == _TEST_USER_ID

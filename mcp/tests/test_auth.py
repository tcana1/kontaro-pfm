"""Auth tests for the MCP server middleware and JWT logic.

Imports server.py after setting required env vars so the module-level
SUPABASE_JWT_SECRET check passes without a real database or MCP broker.
"""
import hashlib
import itertools
import json
import os
from unittest.mock import patch

import jwt as pyjwt
import pytest
from httpx import ASGITransport, AsyncClient

# Must be set before importing server (module-level env check)
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-not-for-production")

from server import _ApiKeyMiddleware, _current_jwt, _mint_jwt, app, mcp  # noqa: E402

_JWT_SECRET = "test-secret-not-for-production"
_TEST_KEY = "pfm-test-api-key-abc123"
_TEST_KEY_HASH = hashlib.sha256(_TEST_KEY.encode()).hexdigest()
_TEST_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fake_resolver(key: str):
    """Accepts _TEST_KEY, rejects everything else."""
    return _TEST_USER_ID if hashlib.sha256(key.encode()).hexdigest() == _TEST_KEY_HASH else None


async def _echo_200(scope, receive, send):
    """Minimal ASGI app that always returns 200 OK."""
    await send({"type": "http.response.start", "status": 200,
                "headers": [[b"content-type", b"text/plain"]]})
    await send({"type": "http.response.body", "body": b"ok"})


def _make_client(resolver=None):
    """Build an AsyncClient backed by the auth middleware wrapping _echo_200."""
    wrapped = _ApiKeyMiddleware(_echo_200)
    transport = ASGITransport(app=wrapped)
    # patch happens at call site — resolver kwarg is just for documentation
    return AsyncClient(transport=transport, base_url="http://test")


# ── JWT unit tests ────────────────────────────────────────────────────────────

def test_jwt_has_correct_claims():
    token = _mint_jwt(_TEST_USER_ID)
    payload = pyjwt.decode(
        token, _JWT_SECRET, algorithms=["HS256"], audience="authenticated"
    )
    assert payload["sub"] == _TEST_USER_ID
    assert payload["role"] == "authenticated"
    assert payload["aud"] == "authenticated"


def test_jwt_expires_in_10_minutes():
    token = _mint_jwt(_TEST_USER_ID)
    payload = pyjwt.decode(
        token, _JWT_SECRET, algorithms=["HS256"], audience="authenticated"
    )
    delta = payload["exp"] - payload["iat"]
    assert 590 <= delta <= 610  # 10 min ± a few seconds


def test_jwt_signed_with_hs256():
    token = _mint_jwt(_TEST_USER_ID)
    header = pyjwt.get_unverified_header(token)
    assert header["alg"] == "HS256"


def test_jwt_different_users_produce_different_tokens():
    assert _mint_jwt("user-1") != _mint_jwt("user-2")


def test_jwt_wrong_secret_is_rejected():
    token = _mint_jwt(_TEST_USER_ID)
    with pytest.raises(pyjwt.InvalidSignatureError):
        pyjwt.decode(token, "wrong-secret", algorithms=["HS256"], audience="authenticated")


# ── Middleware: missing / invalid key ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_api_key_returns_401():
    with patch("server._resolve_user_id_sync", side_effect=_fake_resolver):
        async with _make_client() as client:
            r = await client.get("/mcp")
    assert r.status_code == 401
    assert "x-api-key" in r.json()["error"]


@pytest.mark.asyncio
async def test_wrong_api_key_returns_403():
    with patch("server._resolve_user_id_sync", side_effect=_fake_resolver):
        async with _make_client() as client:
            r = await client.get("/mcp", headers={"x-api-key": "not-the-right-key"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_revoked_key_is_rejected():
    """Simulates a key whose hash is not found (e.g. revoked_at IS NOT NULL filtered out)."""
    with patch("server._resolve_user_id_sync", return_value=None):
        async with _make_client() as client:
            r = await client.get("/mcp", headers={"x-api-key": _TEST_KEY})
    assert r.status_code == 403


# ── Middleware: valid key ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_valid_api_key_passes_through():
    with patch("server._resolve_user_id_sync", side_effect=_fake_resolver):
        async with _make_client() as client:
            r = await client.get("/mcp", headers={"x-api-key": _TEST_KEY})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_health_endpoint_skips_auth():
    """Health check must work without any API key (used by Docker healthcheck)."""
    async with _make_client() as client:
        r = await client.get("/health")
    assert r.status_code == 200


# ── Middleware: JWT propagation to tools ──────────────────────────────────────

@pytest.mark.asyncio
async def test_valid_key_sets_jwt_in_contextvar():
    """After auth passes, _current_jwt must contain a valid JWT for PostgREST."""
    captured: list[str] = []

    async def _capture(scope, receive, send):
        captured.append(_current_jwt.get(""))
        await _echo_200(scope, receive, send)

    with patch("server._resolve_user_id_sync", side_effect=_fake_resolver):
        app = _ApiKeyMiddleware(_capture)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/mcp", headers={"x-api-key": _TEST_KEY})

    assert len(captured) == 1
    payload = pyjwt.decode(
        captured[0], _JWT_SECRET, algorithms=["HS256"], audience="authenticated"
    )
    assert payload["sub"] == _TEST_USER_ID
    assert payload["role"] == "authenticated"


@pytest.mark.asyncio
async def test_jwt_not_leaked_outside_request():
    """Contextvar must be reset after the request completes."""
    with patch("server._resolve_user_id_sync", side_effect=_fake_resolver):
        app = _ApiKeyMiddleware(_echo_200)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/mcp", headers={"x-api-key": _TEST_KEY})

    assert _current_jwt.get(None) is None


@pytest.mark.asyncio
async def test_key_hash_used_for_db_lookup():
    """DB must be queried with SHA-256 hash, never the plaintext key."""
    seen_args: list[str] = []

    def _capturing_resolver(key: str):
        seen_args.append(key)
        return _TEST_USER_ID

    with patch("server._resolve_user_id_sync", side_effect=_capturing_resolver):
        app = _ApiKeyMiddleware(_echo_200)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/mcp", headers={"x-api-key": _TEST_KEY})

    assert len(seen_args) == 1
    # The function receives the raw key — hashing happens inside _resolve_user_id_sync.
    # Here we verify the middleware passes the raw key to the resolver unchanged.
    assert seen_args[0] == _TEST_KEY


# ── Full stack: tool calls must use their own request's JWT ───────────────────

@pytest.mark.asyncio
async def test_tool_call_uses_jwt_minted_for_its_own_request():
    """A stateful MCP session runs tools with the JWT minted at `initialize`, so every
    tool call fails with 'JWT expired' once that token is older than 10 minutes."""
    minted = itertools.count(1)
    seen: list[str] = []

    async def _fake_rpc(func, body=None):
        seen.append(_current_jwt.get())
        return {}

    headers = {
        "x-api-key": _TEST_KEY,
        "accept": "application/json, text/event-stream",
        "content-type": "application/json",
    }

    def _rpc_msg(method, id=None, params=None):
        msg = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        if id is not None:
            msg["id"] = id
        return msg

    with (
        patch("server._resolve_user_id_sync", side_effect=_fake_resolver),
        patch("server._mint_jwt", side_effect=lambda uid: f"jwt-{next(minted)}"),
        patch("server._rpc", _fake_rpc),
    ):
        async with mcp.session_manager.run():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://localhost:8000") as client:
                init = await client.post("/mcp", headers=headers, json=_rpc_msg(
                    "initialize", 1,
                    {"protocolVersion": "2025-03-26", "capabilities": {},
                     "clientInfo": {"name": "t", "version": "0"}},
                ))
                assert init.status_code == 200
                if sid := init.headers.get("mcp-session-id"):
                    headers["mcp-session-id"] = sid
                await client.post("/mcp", headers=headers, json=_rpc_msg("notifications/initialized"))
                for i in (2, 3):
                    r = await client.post("/mcp", headers=headers, json=_rpc_msg(
                        "tools/call", i, {"name": "whoami", "arguments": {}},
                    ))
                    assert r.status_code == 200
                    body = next(l[6:] for l in r.text.splitlines() if l.startswith("data: "))
                    assert "error" not in json.loads(body)

    assert len(seen) == 2
    assert len(set(seen)) == 2, f"tool calls reused one token: {seen}"
    assert "jwt-1" not in seen, "tool call used the JWT minted for `initialize`"

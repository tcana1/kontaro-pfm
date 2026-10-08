"""Tests for the read/analysis tools, patch_analysis_state and the HTTP helpers.

Patches server._rpc / server._get (or the httpx transport), so no PostgREST is needed.
"""
import os
from unittest.mock import patch

import httpx
import pytest

os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-not-for-production")

import server  # noqa: E402
from server import (  # noqa: E402
    get_analysis_state,
    get_insight_run,
    get_installments,
    get_largest_transactions,
    get_month_close,
    get_new_merchants,
    get_reimbursements,
    list_analysis_states,
    list_transactions,
    mcp,
    monthly_analysis,
    patch_analysis_state,
    whoami,
)


class _Recorder:
    def __init__(self, responses=None):
        self.calls = []
        self.responses = responses or {}

    async def rpc(self, func, body=None):
        self.calls.append((func, body))
        return self.responses.get((func, bool(body)), self.responses.get(func))

    async def get(self, path, params=None):
        self.calls.append((path, params))
        return self.responses.get(path, [])


# ── list_transactions ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_transactions_filters_and_paging():
    rec = _Recorder()
    with patch("server._get", side_effect=rec.get):
        await list_transactions(
            start_date="2026-09-01",
            end_date="2026-09-30",
            tag_id=3,
            min_amount=-500,
            max_amount=0,
            exclude_ignored=True,
            fields="payment_date,payee,amount",
            limit=9999,
            offset=200,
        )
    path, params = rec.calls[0]
    assert path == "v_transaction_splits"
    assert ("limit", 500) in params
    assert ("offset", 200) in params
    assert ("select", "payment_date,payee,amount") in params
    assert ("tag_id", "eq.3") in params
    assert ("amount", "gte.-500") in params
    assert ("amount", "lte.0") in params
    assert ("is_ignored", "eq.false") in params
    assert ("payment_date", "gte.2026-09-01") in params
    assert ("payment_date", "lte.2026-09-30") in params
    assert ("order", "payment_date.desc,transaction_id.desc,split_id.desc") in params


@pytest.mark.asyncio
async def test_list_transactions_defaults_keep_ignored_and_all_columns():
    rec = _Recorder()
    with patch("server._get", side_effect=rec.get):
        await list_transactions()
    _, params = rec.calls[0]
    assert not any(k in ("select", "is_ignored", "tag_id") for k, _ in params)
    assert ("limit", 200) in params


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["a;b", "a b", "amount,", "select=*", "a(b)"])
async def test_list_transactions_rejects_bad_fields(bad):
    with patch("server._get") as g:
        with pytest.raises(ValueError, match="fields"):
            await list_transactions(fields=bad)
    g.assert_not_called()


# ── new RPC wrappers ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "coro,func,body",
    [
        (lambda: whoami(), "get_user_overview", None),
        (lambda: get_month_close("2026-09-01"), "get_month_close", {"p_month": "2026-09-01"}),
        (lambda: get_installments("2026-09-01"), "get_dashboard_installments", {"p_month": "2026-09-01"}),
        (
            lambda: get_reimbursements("2026-09-01", "2026-09-30"),
            "get_reimbursements",
            {"p_start": "2026-09-01", "p_end": "2026-09-30"},
        ),
        (
            lambda: get_new_merchants("2026-09-01"),
            "get_new_merchants",
            {"p_month": "2026-09-01", "p_lookback_months": 12},
        ),
        (
            lambda: get_largest_transactions("2026-09-01", "2026-09-30", 5),
            "get_largest_transactions",
            {"p_start": "2026-09-01", "p_end": "2026-09-30", "p_limit": 5},
        ),
    ],
)
async def test_rpc_wrappers_payload(coro, func, body):
    rec = _Recorder()
    with patch("server._rpc", side_effect=rec.rpc):
        await coro()
    assert rec.calls == [(func, body)]


# ── get_insight_run history / list_analysis_states ────────────────────────────


@pytest.mark.asyncio
async def test_get_insight_run_history_queries_table_without_content():
    rec = _Recorder({"insight_runs": [{"id": 2}, {"id": 1}]})
    with patch("server._get", side_effect=rec.get):
        result = await get_insight_run("2026-09", history=True)
    assert result == [{"id": 2}, {"id": 1}]
    path, params = rec.calls[0]
    assert path == "insight_runs"
    assert params["month"] == "eq.2026-09"
    assert "content" not in params["select"]


@pytest.mark.asyncio
async def test_list_analysis_states_orders_newest_first():
    rec = _Recorder()
    with patch("server._get", side_effect=rec.get):
        await list_analysis_states()
    path, params = rec.calls[0]
    assert path == "analysis_state"
    assert params["order"] == "month.desc"
    assert "version" in params["select"]


# ── get_analysis_state sections ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_analysis_state_sections_filters_top_level_keys():
    state = {"flags": {"active": []}, "learned": [1], "open_questions": []}
    rec = _Recorder({"get_analysis_state": state})
    with patch("server._rpc", side_effect=rec.rpc):
        result = await get_analysis_state("2026-09-01", sections=["flags", "nope"])
    assert result == {"flags": {"active": []}}


@pytest.mark.asyncio
async def test_get_analysis_state_sections_on_null_state():
    rec = _Recorder({"get_analysis_state": None})
    with patch("server._rpc", side_effect=rec.rpc):
        assert await get_analysis_state(sections=["flags"]) is None


# ── patch_analysis_state ──────────────────────────────────────────────────────


def _state():
    return {"meta": {"version": 3}, "flags": {"active": [{"name": "A"}], "resolved": []}}


@pytest.mark.asyncio
async def test_patch_saves_on_existing_month():
    rec = _Recorder({("get_analysis_state", True): _state()})
    ops = [{"op": "set", "path": "meta.version", "value": 4}]
    with patch("server._rpc", side_effect=rec.rpc):
        result = await patch_analysis_state("2026-09-01", ops)
    assert result == {"month": "2026-09-01", "based_on": "existing", "applied": ["set meta.version"], "saved": True}
    func, body = rec.calls[-1]
    assert func == "set_analysis_state"
    assert body["p_month"] == "2026-09-01"
    assert body["p_state"]["meta"]["version"] == 4
    assert body["p_state"]["flags"] == _state()["flags"]


@pytest.mark.asyncio
async def test_patch_dry_run_does_not_save():
    rec = _Recorder({("get_analysis_state", True): _state()})
    ops = [{"op": "set", "path": "meta.version", "value": 4}]
    with patch("server._rpc", side_effect=rec.rpc):
        result = await patch_analysis_state("2026-09-01", ops, dry_run=True)
    assert result["saved"] is False
    assert all(f != "set_analysis_state" for f, _ in rec.calls)


@pytest.mark.asyncio
async def test_patch_new_month_starts_from_latest_state():
    rec = _Recorder({("get_analysis_state", False): _state()})
    ops = [{"op": "move", "path": "flags.active", "match": {"name": "A"}, "to": "flags.resolved"}]
    with patch("server._rpc", side_effect=rec.rpc):
        result = await patch_analysis_state("2026-10-01", ops)
    assert result["based_on"] == "latest (new month)"
    saved = rec.calls[-1][1]["p_state"]
    assert saved["flags"]["resolved"] == [{"name": "A"}]
    assert saved["flags"]["active"] == []


@pytest.mark.asyncio
async def test_patch_without_any_state_raises():
    rec = _Recorder()
    with patch("server._rpc", side_effect=rec.rpc):
        with pytest.raises(ValueError, match="no analysis_state"):
            await patch_analysis_state("2026-09-01", [{"op": "set", "path": "a", "value": 1}])


@pytest.mark.asyncio
async def test_patch_failing_op_saves_nothing():
    rec = _Recorder({("get_analysis_state", True): _state()})
    ops = [
        {"op": "set", "path": "meta.version", "value": 4},
        {"op": "remove", "path": "flags.active", "match": {"name": "ZZ"}},
    ]
    with patch("server._rpc", side_effect=rec.rpc):
        with pytest.raises(ValueError, match="nothing saved"):
            await patch_analysis_state("2026-09-01", ops)
    assert all(f != "set_analysis_state" for f, _ in rec.calls)


# ── HTTP helpers ──────────────────────────────────────────────────────────────


@pytest.fixture
def jwt_ctx():
    token = server._current_jwt.set("test-jwt")
    yield
    server._current_jwt.reset(token)


def _client_factory(handler):
    real = httpx.AsyncClient
    return lambda *a, **kw: real(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_rpc_tolerates_empty_body(jwt_ctx):
    factory = _client_factory(lambda req: httpx.Response(204))
    with patch("server.httpx.AsyncClient", side_effect=factory):
        assert await server._rpc("set_analysis_state", {"p_month": "2026-09-01"}) == {"ok": True}


@pytest.mark.asyncio
async def test_rpc_parses_json_body(jwt_ctx):
    factory = _client_factory(lambda req: httpx.Response(200, json={"a": 1}))
    with patch("server.httpx.AsyncClient", side_effect=factory):
        assert await server._rpc("x") == {"a": 1}


@pytest.mark.asyncio
async def test_errors_carry_postgrest_message(jwt_ctx):
    factory = _client_factory(lambda req: httpx.Response(400, json={"message": "month is required"}))
    with patch("server.httpx.AsyncClient", side_effect=factory):
        with pytest.raises(RuntimeError, match="month is required"):
            await server._rpc("x")
        with pytest.raises(RuntimeError, match="PostgREST 400"):
            await server._get("t")


# ── Server surface ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_new_tools_registered():
    names = {t.name for t in await mcp.list_tools()}
    assert {
        "whoami",
        "get_month_close",
        "get_installments",
        "get_reimbursements",
        "get_new_merchants",
        "get_largest_transactions",
        "list_analysis_states",
        "patch_analysis_state",
    } <= names


def test_instructions_describe_conventions():
    text = mcp.instructions
    assert "reimbursement" in text.lower()
    assert "get_month_close" in text


def test_prompt_uses_existing_tools_and_no_reconciliation_caveat():
    text = monthly_analysis("2026-09")[0]["content"]
    assert "get_month_close('2026-09-01')" in text
    assert "observation" in text and "`notes`" not in text
    assert "do not caveat" in text

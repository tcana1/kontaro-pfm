"""Tests for the insight/analysis persistence tools and prompt.

Patches server._rpc / server._get so no PostgREST round-trip is needed.
"""
import os
from unittest.mock import patch

import pytest

os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-not-for-production")

from server import (  # noqa: E402
    get_analysis_state,
    get_insight_run,
    mcp,  # noqa: E402
    save_insight_run,
    set_analysis_state,
)


async def _fake_rpc(*args, **kwargs):
    return {"called": args[0], "body": args[1] if len(args) > 1 else kwargs.get("body")}


# ── save_insight_run ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_insight_run_payload():
    with patch("server._rpc", side_effect=_fake_rpc) as rpc:
        result = await save_insight_run("2026-09", "# Report")

    assert result["called"] == "save_insight_run"
    assert result["body"] == {"p_month": "2026-09", "p_content": "# Report", "p_model": "agent"}
    rpc.assert_awaited_once()


@pytest.mark.asyncio
async def test_save_insight_run_custom_model():
    with patch("server._rpc", side_effect=_fake_rpc) as _rpc:
        result = await save_insight_run("2026-09", "text", model="claude")

    assert result["body"]["p_model"] == "claude"


# ── get_insight_run ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_insight_run_payload():
    with patch("server._rpc", side_effect=_fake_rpc) as _rpc:
        result = await get_insight_run("2026-09")

    assert result["called"] == "get_insight_run"
    assert result["body"] == {"p_month": "2026-09"}


# ── get_analysis_state ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_analysis_state_no_month_empty_body():
    with patch("server._rpc", side_effect=_fake_rpc) as _rpc:
        result = await get_analysis_state()

    assert result["called"] == "get_analysis_state"
    assert result["body"] == {}


@pytest.mark.asyncio
async def test_get_analysis_state_with_month():
    with patch("server._rpc", side_effect=_fake_rpc) as _rpc:
        result = await get_analysis_state("2026-09-01")

    assert result["body"] == {"p_month": "2026-09-01"}


# ── set_analysis_state ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_set_analysis_state_payload():
    state = {"learned": ["something"]}
    with patch("server._rpc", side_effect=_fake_rpc) as _rpc:
        result = await set_analysis_state("2026-09-01", state)

    assert result["called"] == "set_analysis_state"
    assert result["body"] == {"p_month": "2026-09-01", "p_state": state}


# ── Tools are exposed on the server ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_tools_registered():
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert {"save_insight_run", "get_insight_run", "get_analysis_state", "set_analysis_state"} <= names


@pytest.mark.asyncio
async def test_monthly_analysis_prompt_registered():
    prompts = await mcp.list_prompts()
    assert any(p.name == "monthly_analysis" for p in prompts)

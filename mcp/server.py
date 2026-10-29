"""PFM MCP Server — exposes financial query tools to Claude via Streamable HTTP."""
import asyncio
import hashlib
import json
import logging
import os
import re
import urllib.parse
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
import jwt as pyjwt
import psycopg2
from mcp.server.fastmcp import FastMCP

from state_patch import PatchError, apply_ops

# ── Config ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@db:5432/postgres")
_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
_SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

_supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
_supabase_host = urllib.parse.urlparse(_supabase_url).hostname or ""
_POSTGREST_URL = (
    os.getenv("POSTGREST_URL")
    or (f"{_supabase_url}/rest/v1" if _supabase_host.endswith(".supabase.co") else None)
    or "http://postgrest:3000"
).rstrip("/")

_POSTGREST_EXTRA_HEADERS: dict = {"apikey": _SUPABASE_ANON_KEY} if _SUPABASE_ANON_KEY else {}

if not _JWT_SECRET:
    raise RuntimeError("SUPABASE_JWT_SECRET is required")

# ── Per-request user context ──────────────────────────────────────────────────
_current_jwt: ContextVar[str] = ContextVar("current_jwt")


# ── Auth helpers ──────────────────────────────────────────────────────────────
def _resolve_user_id_sync(api_key: str) -> Optional[str]:
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    with psycopg2.connect(_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # UPDATE ... RETURNING, not SELECT: stamping last_used_at here costs no
            # extra round trip. Don't try to throttle the write with a time predicate —
            # inside the window the statement matches no row and auth would 403.
            cur.execute(
                "UPDATE user_api_keys SET last_used_at = now() "
                "WHERE key_hash = %s AND revoked_at IS NULL RETURNING user_id::text",
                (key_hash,),
            )
            row = cur.fetchone()
            return row[0] if row else None


def _mint_jwt(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return pyjwt.encode(
        {
            "sub": user_id,
            "role": "authenticated",
            "aud": "authenticated",
            "iat": now,
            "exp": now + timedelta(minutes=10),
        },
        _JWT_SECRET,
        algorithm="HS256",
    )


# ── PostgREST client ──────────────────────────────────────────────────────────
def _check(r: httpx.Response) -> None:
    # Surface PostgREST's own error message (e.g. a RAISE EXCEPTION from an RPC)
    # instead of a bare "400 Bad Request".
    if r.status_code >= 400:
        raise RuntimeError(f"PostgREST {r.status_code}: {r.text[:500]}")


async def _get(path: str, params=None) -> Any:
    jwt = _current_jwt.get()
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{_POSTGREST_URL}/{path.lstrip('/')}",
            headers={"Authorization": f"Bearer {jwt}", "Accept": "application/json", **_POSTGREST_EXTRA_HEADERS},
            params=params,
            timeout=30,
        )
        _check(r)
        return r.json()


async def _rpc(func: str, body: dict | None = None) -> Any:
    jwt = _current_jwt.get()
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{_POSTGREST_URL}/rpc/{func}",
            headers={
                "Authorization": f"Bearer {jwt}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                **_POSTGREST_EXTRA_HEADERS,
            },
            json=body or {},
            timeout=30,
        )
        _check(r)
        # Void RPCs (e.g. set_analysis_state) answer with an empty body.
        return r.json() if r.content.strip() else {"ok": True}


# ── MCP tools ─────────────────────────────────────────────────────────────────
_INSTRUCTIONS = """\
PFM: personal finance data for ONE user. Every tool is scoped to the owner of the API key.

Conventions
- Amounts: negative = money out, positive = money in. The aggregate tools return expenses as positive numbers.
- Spending = splits in non-income categories (category_is_income = false), excluding is_ignored = true.
- A positive amount inside an expense category is a REIMBURSEMENT, not income:
  gross = outflows, reimbursements = positives, net = gross - reimbursements.
  get_month_close returns all three. get_monthly_totals' "current_net" is the net spending figure.
- list_transactions returns one row per split. Sum `amount` for category totals; sum
  `transaction_amount` grouped by transaction_id only for whole-transaction totals.
- Transaction status (pending/cleared, reconciled or not) does not change any total. Do not
  caveat an analysis because of it.
- Dates: aggregate tools take YYYY-MM-DD (a month = its first day). Insight runs take YYYY-MM.
- PROJECTION: the bank does not report the installments of a card bill that is still open, so
  get_month_close returns a `projection` block (and get_installments a `due_this_month` bucket)
  with the installments each series is expected to be charged this month. These are inferred,
  not stored, and are NOT part of any total. Never add them into net/gross; quote them
  separately as "expected to still land" when the month is not closed yet.

Monthly analysis workflow (the monthly_analysis prompt has the full text)
1. whoami(), then get_analysis_state() and get_insight_run(previous month) for learned context.
2. get_month_close(month) for the numbers, drill into anomalies with the other tools.
3. Present the draft in chat. Persist only after the user says "commit" and confirms:
   save_insight_run(month, report), then patch_analysis_state(...) for new learnings.
"""

# Stateless: a stateful session runs tools in a task whose context was copied at
# `initialize`, so _current_jwt would stay frozen at that request's 10-minute token.
mcp = FastMCP("pfm-finance", instructions=_INSTRUCTIONS, stateless_http=True)


@mcp.tool()
async def list_categories() -> list:
    """List all categories (system and user-defined) for the current user."""
    return await _get("categories", {"order": "name.asc"})


@mcp.tool()
async def list_payees() -> list:
    """List all payees (merchants / counterparties) for the current user."""
    return await _get("payees", {"order": "name.asc"})


@mcp.tool()
async def list_accounts() -> list:
    """List all bank and credit accounts for the current user."""
    return await _get("accounts", {"order": "name.asc"})


@mcp.tool()
async def list_tags() -> list:
    """List all tags for the current user (used to group transactions, e.g. trips)."""
    return await _get("tags", {"order": "name.asc"})


_FIELDS_RE = re.compile(r"^[a-z_]+(,[a-z_]+)*$")


@mcp.tool()
async def list_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    payee: Optional[str] = None,
    tag_id: Optional[int] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    exclude_ignored: bool = False,
    fields: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> list:
    """
    List transactions with optional filters. Dates in YYYY-MM-DD, filtered on payment_date.

    Returns one row per split. Each row has both `amount` (split-level, already
    categorized) and `transaction_amount` (total transaction). To aggregate overall
    spending, sum `transaction_amount` grouped by `transaction_id` to avoid
    double-counting multi-split transactions. To aggregate by category, sum `amount`.

    SIGN CONVENTION: amounts are negative for expenses and positive for income.
    min_amount/max_amount filter the split-level `amount` (e.g. max_amount=0 keeps
    only outflows). The dedicated aggregate tools (get_month_close,
    get_expense_breakdown, get_monthly_totals) already return positive values for
    expenses and apply the spending filters: prefer them over manual aggregation.

    Paging: limit is capped at 500; page with offset (results are ordered by
    payment_date desc). `fields` is a comma-separated column list (e.g.
    "payment_date,payee,amount,category_name,observation") that keeps payloads
    small; a full month with every column can exceed 300 KB.
    exclude_ignored=true drops rows the user marked as ignored (the aggregate tools
    always drop them).
    """
    params: list[tuple] = [
        ("limit", max(1, min(limit, 500))),
        ("offset", max(0, offset)),
        ("order", "payment_date.desc,transaction_id.desc,split_id.desc"),
    ]
    if fields:
        if not _FIELDS_RE.match(fields):
            raise ValueError("fields must be a comma-separated list of column names")
        params.append(("select", fields))
    if start_date:
        params.append(("payment_date", f"gte.{start_date}"))
    if end_date:
        params.append(("payment_date", f"lte.{end_date}"))
    if account_id is not None:
        params.append(("account_id", f"eq.{account_id}"))
    if category_id is not None:
        params.append(("category_id", f"eq.{category_id}"))
    if tag_id is not None:
        params.append(("tag_id", f"eq.{tag_id}"))
    if payee:
        params.append(("payee", f"ilike.*{payee}*"))
    if min_amount is not None:
        params.append(("amount", f"gte.{min_amount}"))
    if max_amount is not None:
        params.append(("amount", f"lte.{max_amount}"))
    if exclude_ignored:
        params.append(("is_ignored", "eq.false"))
    return await _get("v_transaction_splits", params)


@mcp.tool()
async def get_monthly_totals(month: str) -> Any:
    """
    Total spending for a month compared to the prior month and the same month last year.
    month must be the first day of the month in YYYY-MM-DD format (e.g. '2025-08-01').

    Income categories are excluded: this is spending, not a savings balance. current_net,
    prior_net and prior_year_net are positive = spent, net of reimbursements, and always
    cover whole calendar months. current_gross and current_reimbursements break the current
    month's net into its two parts.

    When `month` is the month in progress the response also carries an equal-elapsed-days
    comparison: mtd_net, prior_mtd_net and prior_year_mtd_net each cover day 1 through
    comparison_through (comparison_days days), so a half-finished month is not compared
    against two whole ones. These fields are null for a closed month. Use them for MoM/YoY
    percentages on an open month; use *_net for the month's actual totals. Do not mix the
    two families in one comparison.

    projected_installments is the open card bill's inferred installments for the whole
    month, and projected_mtd the same projection cut to the elapsed-days window (null for
    a closed month). Neither is part of any total. Because the open bill reports no
    installment while the comparison months carry theirs, the dashboard adds projected_mtd
    to mtd_net for the MoM/YoY percentage only: do the same if you quote that percentage,
    and keep quoting the projection separately from the month's actual spending.

    For a savings balance (income minus expenses) use get_income_vs_expenses; for the full
    month snapshot with averages and YoY use get_month_close.
    """
    return await _rpc("get_dashboard_monthly_totals", {"p_month": month})


@mcp.tool()
async def get_category_trends(month: str, limit: int = 10) -> Any:
    """
    Top-N spending categories for the month with 6-month historical trend data.
    month = first day of month in YYYY-MM-DD (e.g. '2025-08-01').
    """
    return await _rpc("get_dashboard_category_trends", {"p_month": month, "p_limit": limit})


@mcp.tool()
async def get_spending_surprises(month: str) -> Any:
    """
    Categories that deviated significantly from their 3-month baseline — useful for
    spotting unusual spending. month = first day of month in YYYY-MM-DD.
    """
    return await _rpc("get_dashboard_surprises", {"p_month": month})


@mcp.tool()
async def get_expense_breakdown(
    start_date: str,
    end_date: str,
    account_ids: Optional[list[int]] = None,
    category_ids: Optional[list[int]] = None,
    group_ids: Optional[list[int]] = None,
    excluded_tag_ids: Optional[list[int]] = None,
) -> Any:
    """
    Expense totals grouped by category/group for a date range. Dates in YYYY-MM-DD.
    Income categories are excluded. All returned amounts are positive (sign already
    inverted from the raw DB values).
    """
    return await _rpc(
        "get_expense_breakdown",
        {
            "start_date": start_date,
            "end_date": end_date,
            "input_account_ids": account_ids or None,
            "input_group_ids": group_ids or None,
            "input_category_ids": category_ids or None,
            "input_excluded_tag_ids": excluded_tag_ids or None,
        },
    )


@mcp.tool()
async def get_income_vs_expenses(
    start_date: str,
    end_date: str,
    account_ids: Optional[list[int]] = None,
    category_ids: Optional[list[int]] = None,
    group_ids: Optional[list[int]] = None,
    excluded_tag_ids: Optional[list[int]] = None,
) -> Any:
    """
    Income and expense breakdown by group/category for a date range. Dates in YYYY-MM-DD.

    This is the correct tool for "net balance" questions (how much was saved / left over,
    receita − despesa). Returns both income and expense totals so you can compute the
    true net. Prefer this over get_monthly_totals whenever the user asks about balance,
    savings, or how much income vs spending occurred in a period.
    """
    return await _rpc(
        "get_income_vs_expenses",
        {
            "start_date": start_date,
            "end_date": end_date,
            "input_account_ids": account_ids or None,
            "input_category_ids": category_ids or None,
            "input_group_ids": group_ids or None,
            "input_excluded_tag_ids": excluded_tag_ids or None,
        },
    )


@mcp.tool()
async def get_category_ranking(
    start_date: str,
    end_date: str,
    account_ids: Optional[list[int]] = None,
    category_ids: Optional[list[int]] = None,
    group_ids: Optional[list[int]] = None,
    sort_by: str = "recent_year",
) -> Any:
    """
    Category rankings with year-over-year totals, percentages, and monthly averages.
    sort_by: 'recent_year' (default) | 'prior_year' | 'change'.
    Dates in YYYY-MM-DD.
    """
    return await _rpc(
        "get_category_ranking",
        {
            "start_date": start_date,
            "end_date": end_date,
            "input_account_ids": account_ids or None,
            "input_category_ids": category_ids or None,
            "input_group_ids": group_ids or None,
            "sort_by": sort_by,
        },
    )


@mcp.tool()
async def get_account_balances(account_id: Optional[int] = None) -> Any:
    """
    Account balances broken down by starting, cleared, pending, and total.
    Pass account_id to get a single account; omit for all accounts.
    """
    return await _rpc("get_account_balances", {"account_id_param": account_id})


@mcp.tool()
async def get_top_merchants_for_category(
    category_id: int,
    start_date: str,
    end_date: str,
    limit: int = 10,
) -> Any:
    """Top merchants (payees) by spend within a specific category. Dates in YYYY-MM-DD."""
    return await _rpc(
        "get_top_merchants_for_category",
        {
            "start_date": start_date,
            "end_date": end_date,
            "input_category_id": category_id,
            "limit_n": limit,
        },
    )


@mcp.tool()
async def get_tag_summary(tag_id: int) -> Any:
    """Total spend, transaction count, date range, and category breakdown for a tag."""
    return await _rpc("get_tag_summary", {"p_tag_id": tag_id})


@mcp.tool()
async def whoami() -> Any:
    """
    Overview of the data behind this API key: transaction count, first and last
    transaction date, and the months that have data. Call it first to confirm the key
    points at the expected user and to know which months can be analyzed.
    """
    return await _rpc("get_user_overview")


@mcp.tool()
async def get_month_close(month: str) -> Any:
    """
    One-call snapshot of a month, month = YYYY-MM-DD (first day). Returns gross,
    reimbursements and net spending for the month, the prior month and the same month
    last year, the MoM / YoY deltas, and the trailing 3-month average of net.
    Also returns a `projection` block: installments an open card bill is expected to
    charge this month that the bank has not reported yet. Inferred, not in the totals.
    Start the analysis here instead of stitching several tools together.
    """
    return await _rpc("get_month_close", {"p_month": month})


@mcp.tool()
async def get_installments(month: str) -> Any:
    """
    Installment series for a month (YYYY-MM-DD, first day): active, stalled, ending this
    month, starting this month, and `due_this_month` — series owed an installment this
    month that has not been reported yet (inferred, not stored). Use it for the
    installment tracker and the outlook.
    """
    return await _rpc("get_dashboard_installments", {"p_month": month})


@mcp.tool()
async def get_reimbursements(start_date: str, end_date: str) -> Any:
    """
    Positive amounts inside expense categories (reimbursements, refunds) between two
    dates (YYYY-MM-DD), grouped by payee, with the category each one offsets.
    """
    return await _rpc("get_reimbursements", {"p_start": start_date, "p_end": end_date})


@mcp.tool()
async def get_new_merchants(month: str, lookback_months: int = 12) -> Any:
    """
    Payees with net spending in the month (YYYY-MM-DD, first day) that had no spending
    in the previous lookback_months. Useful for spotting new recurring charges.
    """
    return await _rpc("get_new_merchants", {"p_month": month, "p_lookback_months": lookback_months})


@mcp.tool()
async def get_largest_transactions(start_date: str, end_date: str, limit: int = 20) -> Any:
    """
    Largest spending transactions between two dates (YYYY-MM-DD), biggest first,
    excluding ignored ones. Good for explaining one-off spikes.
    """
    return await _rpc("get_largest_transactions", {"p_start": start_date, "p_end": end_date, "p_limit": limit})


@mcp.tool()
async def query_postgrest(path: str, params: Optional[dict] = None) -> Any:
    """
    Generic read-only GET query against PostgREST. Use for cases not covered by
    the dedicated tools. Always issues a GET — no writes are possible here.
    `params` must be a dict of {column: "operator.value"}; a list of tuples is NOT accepted.

    ── Useful tables / views ────────────────────────────────────────────────────

    v_transaction_splits  (main view — prefer this over raw tables)
      transaction_id, payment_date, purchase_date, payee, amount (negative=expense,
      positive=income), transaction_amount (total tx), account_id, account_name,
      account_type, category_id, category_name, category_is_income,
      category_group_id, category_group_name, status_id, status_name, is_ignored,
      tag_id, tag_name, split_id, observation, is_reconciled,
      installment_number, installment_total, to_account_id, to_account_name

    transactions          payment_date, purchase_date, payee, type, account_id,
                          status_id, is_ignored, import_batch_id
    transaction_splits    transaction_id, amount, category_id, observation
    accounts              id, name, type, icon, is_archived, initial_balance
    categories            id, name, group_id, color
    category_groups       id, name, emoji, is_income  ← use to find income groups
    tags                  id, name, color
    payees                id, name
    import_batches        id, created_at, source, file_name, transaction_count

    ── PostgREST filter syntax ──────────────────────────────────────────────────
    Equality:      {"category_id": "eq.5"}
    Comparison:    {"amount": "lt.0"}  |  {"payment_date": "gte.2024-01-01"}
    Negation:      {"is_ignored": "eq.false"}
    ILIKE:         {"payee": "ilike.*mercado*"}
    Same column twice: params is a dict, so use PostgREST's and= operator, e.g.
                   {"and": "(payment_date.gte.2024-01-01,payment_date.lte.2024-01-31)"}
    Ordering:      {"order": "payment_date.desc"}
    Limit:         {"limit": "100"}
    Select cols:   {"select": "transaction_id,payee,amount"}

    Note: cannot call RPC functions — use the dedicated tools for those.
    """
    return await _get(path, params)


# ── Insight / analysis persistence tools ──────────────────────────────────────
#
# These productize the monthly-analysis workflow: the agent reasons with the
# read tools above, then persists the result here. Writes scoped to the calling
# user via SECURITY DEFINER RPCs (auth.uid() <==> API key owner).


@mcp.tool()
async def save_insight_run(month: str, content: str, model: str = "agent") -> Any:
    """
    Persist a monthly analysis report (markdown) for a month in YYYY-MM format.
    The report becomes visible on the app dashboard's Analysis drawer. Call only
    after the user confirms the final report.

    Every call inserts a new version; get_insight_run returns the latest one for the
    month (older versions stay available via get_insight_run(history=true)).
    Returns {id, month, created_at}.
    """
    return await _rpc("save_insight_run", {"p_month": month, "p_content": content, "p_model": model})


@mcp.tool()
async def get_insight_run(month: str, history: bool = False) -> Any:
    """
    Get the latest saved monthly analysis report for a month in YYYY-MM format
    ({id, month, model, content, created_at}), or null if there is none.
    Useful as prior-run context before writing a new analysis.

    history=true instead lists every saved version of that month (without content),
    newest first: [{id, model, created_at}].
    """
    if history:
        return await _get(
            "insight_runs",
            {"select": "id,model,created_at", "month": f"eq.{month}", "order": "created_at.desc"},
        )
    return await _rpc("get_insight_run", {"p_month": month})


@mcp.tool()
async def list_analysis_states() -> Any:
    """
    List the months that have a saved analysis_state, newest first:
    [{month (YYYY-MM-DD), created_at, version}]. Use it to see what exists before
    reading or patching a specific month.
    """
    return await _get(
        "analysis_state",
        {"select": "month,created_at,version:state->meta->>version", "order": "month.desc"},
    )


@mcp.tool()
async def get_analysis_state(month: Optional[str] = None, sections: Optional[list[str]] = None) -> Any:
    """
    Get the analysis knowledge base (JSON) for a month in YYYY-MM-DD format (the first
    day of the month, unlike get_insight_run which takes YYYY-MM), or the most recent
    state if month is omitted. Load learned facts before analyzing. Returns null if
    nothing is saved.

    The full state can be tens of KB. Pass sections (top-level keys such as
    ["flags", "open_questions"]) to read only what you need.
    """
    body: dict = {}
    if month:
        body["p_month"] = month
    state = await _rpc("get_analysis_state", body)
    if sections and isinstance(state, dict):
        return {k: state[k] for k in sections if k in state}
    return state


@mcp.tool()
async def set_analysis_state(month: str, state: Any) -> Any:
    """
    Replace the analysis knowledge base (JSON object) for a month in YYYY-MM-DD
    format (upsert: the whole object is overwritten). Prefer patch_analysis_state
    for incremental updates so no existing key is lost.
    """
    return await _rpc("set_analysis_state", {"p_month": month, "p_state": state})


@mcp.tool()
async def patch_analysis_state(month: str, ops: list[dict], dry_run: bool = False) -> Any:
    """
    Apply incremental edits to the analysis state of a month (YYYY-MM-DD) without
    rewriting it. If that month has no state yet, it starts as a copy of the most
    recent one, so nothing is lost when rolling forward to a new month.

    ops is applied in order and atomically (any failing op aborts the whole patch;
    ops that match nothing fail instead of silently doing nothing). Paths are dotted
    (a numeric segment indexes a list):
      {"op":"set",    "path":"meta.last_monthly_run", "value":"2026-09"}
      {"op":"append", "path":"flags.active", "value":{...}}
      {"op":"remove", "path":"flags.active", "match":{"name":"X"}}
      {"op":"update", "path":"flags.active", "match":{"name":"X"}, "value":{"note":"..."}}
      {"op":"move",   "path":"flags.active", "match":{"name":"X"}, "to":"flags.resolved",
                      "value":{"resolution":"..."}}
    dry_run=true returns what would change without saving, for the "summarize before
    saving" step. Returns {month, based_on, applied, saved}.
    """
    existing = await _rpc("get_analysis_state", {"p_month": month})
    if isinstance(existing, dict):
        base, based_on = existing, "existing"
    else:
        latest = await _rpc("get_analysis_state", {})
        if not isinstance(latest, dict):
            raise ValueError("no analysis_state exists yet; create one with set_analysis_state")
        base, based_on = latest, "latest (new month)"
    try:
        new_state, log = apply_ops(base, ops)
    except PatchError as e:
        raise ValueError(f"patch rejected, nothing saved: {e}") from None
    if not dry_run:
        await _rpc("set_analysis_state", {"p_month": month, "p_state": new_state})
    return {"month": month, "based_on": based_on, "applied": log, "saved": not dry_run}


# ── Prompt: monthly financial analysis ────────────────────────────────────────


@mcp.prompt()
def monthly_analysis(month: str) -> list:
    """
    Collaborative monthly financial analysis of your PFM data. Produces the
    markdown report shown on the app dashboard. month = YYYY-MM.
    """
    first_day = f"{month}-01"
    return [
        {
            "role": "user",
            "content": (
                f"You are a personal finance analyst assistant. Run a collaborative "
                f"monthly financial analysis of {month} for this PFM user.\n\n"
                "Step 0 — orient: call whoami() to confirm the data and the available "
                "months, then get_analysis_state() (use sections=[...] if it is large) "
                "and get_insight_run for the previous month. Apply learned facts "
                "silently. If there is no previous run, say so and skip the comparison.\n\n"
                "Core tools (all scoped to the current user):\n"
                f"- get_month_close('{first_day}') — gross, reimbursements, net, MoM/YoY and 3-month average in one call; start here\n"
                "- get_category_trends / get_spending_surprises — category trend and baseline deviations\n"
                "- get_expense_breakdown / get_category_ranking — totals per category, YoY\n"
                "- get_income_vs_expenses — savings balance (income minus expenses)\n"
                "- get_installments — active / ending / starting series\n"
                "- get_reimbursements / get_new_merchants / get_largest_transactions — what moved the month\n"
                "- list_transactions — line detail (filter by category, tag, amount; use fields to keep it small)\n"
                "- get_top_merchants_for_category / get_tag_summary — merchant and tag context\n"
                "- list_tags / list_payees / list_categories / list_accounts — reference data\n"
                "- query_postgrest — generic read-only queries when nothing else fits\n"
                "- save_insight_run / get_insight_run — persist / read the monthly report\n"
                "- get_analysis_state / patch_analysis_state / set_analysis_state — knowledge base; prefer patch for updates\n\n"
                "When something looks anomalous, drill in before concluding. Use the "
                "`observation` (free text) and `tag_name` (events like 'Viagem', "
                "'Reforma') fields of list_transactions before flagging: a spike tied "
                "to a known tag is expected, not anomalous. Transaction status "
                "(pending / reconciled) does not change the totals, so do not caveat "
                "the report because of it.\n\n"
                "Report template (markdown, in this order):\n"
                "1. Snapshot — gross, reimbursements, net vs prior month and last year\n"
                "2. Category breakdown — highlights, anomalies, trends, one-offs\n"
                "3. Reimbursements — who paid back what\n"
                "4. Flags and observations — investigated and explained\n"
                "5. Installment tracker — ended, new, relevant active series\n"
                "6. Outlook — next month, with an estimate\n\n"
                "Present the draft in chat and wait for feedback — do NOT persist yet. "
                "When the user says commit, summarize what you will save (report plus "
                "state changes, using patch_analysis_state with dry_run=true), wait for "
                f"confirmation, then call save_insight_run('{month}', content) and "
                "patch_analysis_state."
            ),
        }
    ]


# ── ASGI middleware (pure ASGI — no BaseHTTPMiddleware to preserve contextvars) ──
class _ApiKeyMiddleware:
    def __init__(self, app):
        self._app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        if scope["path"] == "/health":
            await _json_response(send, 200, {"status": "ok"})
            return

        headers = {k: v for k, v in scope.get("headers", [])}
        api_key = headers.get(b"x-api-key", b"").decode()

        if not api_key:
            await _json_response(send, 401, {"error": "x-api-key header required"})
            return

        user_id = await asyncio.to_thread(_resolve_user_id_sync, api_key)
        if not user_id:
            await _json_response(send, 403, {"error": "Invalid or revoked API key"})
            return

        token = _current_jwt.set(_mint_jwt(user_id))
        try:
            await self._app(scope, receive, send)
        finally:
            _current_jwt.reset(token)


async def _json_response(send, status: int, body: dict):
    content = json.dumps(body).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [[b"content-type", b"application/json"]],
    })
    await send({"type": "http.response.body", "body": content})


# ── Entry point ───────────────────────────────────────────────────────────────
app = _ApiKeyMiddleware(mcp.streamable_http_app())

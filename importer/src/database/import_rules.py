"""Account import rules — map a statement's fingerprint to an account."""
import logging
import re
from typing import Optional

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def list_import_rules() -> list[dict]:
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT r.id::text, r.bank, r.type,
                   r.text_pattern, r.filename_pattern,
                   a.slug AS account_slug, a.id AS account_id
            FROM account_import_rules r
            JOIN accounts a ON a.id = r.account_id
            WHERE r.user_id = %s
            ORDER BY r.created_at
        """, (get_user_id(),))
        return [dict(row) for row in cur.fetchall()]


def create_import_rule(account_id: int, bank: str, type_: str,
                       text_pattern: Optional[str] = None,
                       filename_pattern: Optional[str] = None) -> str:
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO account_import_rules
                (user_id, account_id, bank, type, text_pattern, filename_pattern)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id::text
        """, (get_user_id(), account_id, bank, type_, text_pattern, filename_pattern))
        return cur.fetchone()[0]


def delete_import_rule(rule_id: str) -> bool:
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM account_import_rules WHERE id = %s AND user_id = %s",
            (rule_id, get_user_id())
        )
        return cur.rowcount > 0


def resolve_account_from_rules(bank: str, type_: str, text: str = "",
                                filename: str = "") -> tuple[Optional[int], str]:
    """
    Match file fingerprint against the user's import rules.
    Each rule's text_pattern and filename_pattern are ANDed: a rule is a candidate
    only if every pattern it defines matches. Returns (account_id, "ok") on unique
    match, (None, "ambiguous") or (None, "not_found").
    """
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT id::text, account_id, text_pattern, filename_pattern
            FROM account_import_rules
            WHERE user_id = %s AND bank = %s AND type = %s
            ORDER BY
                (text_pattern IS NOT NULL) DESC,
                (filename_pattern IS NOT NULL) DESC
        """, (get_user_id(), bank, type_))
        rows = cur.fetchall()

    if not rows:
        return None, "not_found"

    matches = []
    for row in rows:
        try:
            if row["text_pattern"] and not re.search(row["text_pattern"], text, re.IGNORECASE):
                continue
            if row["filename_pattern"] and not re.search(row["filename_pattern"], filename, re.IGNORECASE):
                continue
        except re.error:
            continue
        matches.append(row)

    if not matches:
        return None, "not_found"
    if len(matches) == 1:
        return matches[0]["account_id"], "ok"
    return None, "ambiguous"

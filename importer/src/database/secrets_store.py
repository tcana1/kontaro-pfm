"""Per-user encrypted secrets: PDF passwords and the OpenExchangeRates key.

Values are stored encrypted; only the *_plaintext / getter helpers decrypt, and
they never log the decrypted value.
"""
import logging
from typing import Optional

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


# ── PDF passwords ─────────────────────────────────────────────────────────────

def list_pdf_passwords() -> list[dict]:
    """Returns id + label only (never the plaintext)."""
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT id::text, label, created_at
            FROM user_pdf_passwords
            WHERE user_id = %s
            ORDER BY created_at
        """, (get_user_id(),))
        return [dict(row) for row in cur.fetchall()]


def add_pdf_password(label: str, password_enc: str) -> str:
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO user_pdf_passwords (user_id, label, password_enc)
            VALUES (%s, %s, %s) RETURNING id::text
        """, (get_user_id(), label, password_enc))
        return cur.fetchone()[0]


def delete_pdf_password(pw_id: str) -> bool:
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM user_pdf_passwords WHERE id = %s AND user_id = %s",
            (pw_id, get_user_id())
        )
        return cur.rowcount > 0


def get_pdf_passwords_plaintext() -> list[str]:
    """Decrypt and return all PDF passwords for the current user."""
    from src.security.crypto import decrypt
    with db_cursor() as cur:
        cur.execute(
            "SELECT password_enc FROM user_pdf_passwords WHERE user_id = %s ORDER BY created_at",
            (get_user_id(),)
        )
        rows = cur.fetchall()
    return [decrypt(row[0]) for row in rows]


# ── OpenExchangeRates key ─────────────────────────────────────────────────────

def get_openexchange_key() -> Optional[str]:
    """Returns the decrypted OXR key for the current user, or None."""
    from src.security.crypto import decrypt
    with db_cursor() as cur:
        cur.execute(
            "SELECT key_enc FROM user_openexchange_keys WHERE user_id = %s",
            (get_user_id(),)
        )
        row = cur.fetchone()
    return decrypt(row[0]) if row else None


def set_openexchange_key(key_enc: str) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO user_openexchange_keys (user_id, key_enc, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (user_id) DO UPDATE SET key_enc = EXCLUDED.key_enc, updated_at = now()
        """, (get_user_id(), key_enc))


def delete_openexchange_key() -> None:
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM user_openexchange_keys WHERE user_id = %s", (get_user_id(),))

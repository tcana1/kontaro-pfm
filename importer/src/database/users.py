"""User identity and per-user settings lookups."""
import logging
from typing import Optional

from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def resolve_user_id_from_key_hash(key_hash: str) -> Optional[str]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT user_id::text FROM user_api_keys WHERE key_hash = %s AND revoked_at IS NULL",
            (key_hash,)
        )
        row = cur.fetchone()
        return row[0] if row else None

"""Open Finance connector config, accounts, and sync state."""
import logging
from datetime import datetime
from typing import Optional

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def get_all_enabled_connectors() -> list[dict]:
    """Reads ALL users' enabled connectors — privileged, for the sync orchestrator."""
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT id::text, user_id::text, provider, client_id, client_secret_enc,
                   schedule, import_from, pluggy_item_id, timezone
            FROM connectors
            WHERE enabled = true
            ORDER BY user_id, created_at
        """)
        return [dict(r) for r in cur.fetchall()]


def list_connectors() -> list[dict]:
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT id::text, provider, client_id, schedule, enabled, import_from,
                   pluggy_item_id, timezone, created_at
            FROM connectors
            WHERE user_id = %s
            ORDER BY created_at
        """, (get_user_id(),))
        return [dict(r) for r in cur.fetchall()]


def get_connector(connector_id: str) -> Optional[dict]:
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT id::text, provider, client_id, client_secret_enc, schedule, enabled,
                   import_from, pluggy_item_id, timezone, created_at
            FROM connectors
            WHERE id = %s AND user_id = %s
        """, (connector_id, get_user_id()))
        row = cur.fetchone()
        return dict(row) if row else None


def create_connector(provider: str, client_id: str, client_secret_enc: str,
                     schedule: str, import_from, pluggy_item_id: Optional[str] = None,
                     timezone: str = "America/Sao_Paulo") -> str:
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO connectors
                (user_id, provider, client_id, client_secret_enc, schedule, import_from, pluggy_item_id, timezone)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id::text
        """, (get_user_id(), provider, client_id, client_secret_enc, schedule,
              import_from, pluggy_item_id, timezone))
        return cur.fetchone()[0]


def update_connector(connector_id: str, **fields) -> bool:
    if not fields:
        return False
    allowed = {"client_id", "client_secret_enc", "schedule", "enabled", "import_from", "pluggy_item_id", "timezone"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if not fields:
        return False
    fields["updated_at"] = "now()"
    set_clause = ", ".join(
        f"{k} = now()" if v == "now()" else f"{k} = %s"
        for k, v in fields.items()
    )
    values = [v for v in fields.values() if v != "now()"]
    with db_cursor(commit=True) as cur:
        cur.execute(
            f"UPDATE connectors SET {set_clause} WHERE id = %s AND user_id = %s",
            values + [connector_id, get_user_id()]
        )
        return cur.rowcount > 0


def delete_connector(connector_id: str) -> bool:
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM connectors WHERE id = %s AND user_id = %s",
            (connector_id, get_user_id())
        )
        return cur.rowcount > 0


def get_connector_accounts(connector_id: str) -> list[dict]:
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT ca.id::text, ca.pluggy_account_id, ca.type, ca.name,
                   a.slug AS account_slug
            FROM connector_accounts ca
            JOIN accounts a ON a.id = ca.account_id
            WHERE ca.connector_id = %s AND ca.user_id = %s
        """, (connector_id, get_user_id()))
        return [dict(r) for r in cur.fetchall()]


def get_connector_sync_state(connector_account_id: str) -> dict:
    with db_cursor(dict_rows=True) as cur:
        cur.execute("""
            SELECT last_sync_at, last_error, last_synced_created_at
            FROM connector_sync_state
            WHERE connector_account_id = %s AND user_id = %s
        """, (connector_account_id, get_user_id()))
        row = cur.fetchone()
        return dict(row) if row else {}


def store_connector_sync_state(
    connector_account_id: str,
    error: Optional[str],
    last_synced_created_at: Optional[datetime] = None,
) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute("""
            INSERT INTO connector_sync_state
                (user_id, connector_account_id, last_sync_at, last_error, last_synced_created_at)
            VALUES (%s, %s, now(), %s, %s)
            ON CONFLICT (user_id, connector_account_id)
            DO UPDATE SET
                last_sync_at  = EXCLUDED.last_sync_at,
                last_error    = EXCLUDED.last_error,
                -- Never wipe a valid marker when recording an error or a manual resync (NULL passed)
                last_synced_created_at = COALESCE(EXCLUDED.last_synced_created_at, connector_sync_state.last_synced_created_at)
        """, (get_user_id(), connector_account_id, error, last_synced_created_at))

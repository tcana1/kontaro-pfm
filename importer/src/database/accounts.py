"""Account lookup and creation."""
import logging
from typing import Dict, List, Tuple

import psycopg2.extras

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def get_account_name_by_id(account_id: int) -> str | None:
    """
    Retrieves the account name from the database based on the account ID.
    Returns the account name or None if not found.
    """
    with db_cursor() as cur:
        cur.execute("SELECT name FROM accounts WHERE id = %s AND user_id = %s", (account_id, get_user_id()))
        result = cur.fetchone()
        return result[0] if result else None


def get_account_names_by_ids_bulk(account_ids: List[int]) -> Dict[int, str]:
    """
    Retrieves account names for a list of account IDs in bulk.
    Returns a dictionary mapping account IDs to their names.
    """
    if not account_ids:
        return {}

    with db_cursor() as cur:
        cur.execute("SELECT id, name FROM accounts WHERE id = ANY(%s) AND user_id = %s", (account_ids, get_user_id()))
        return {acc_id: acc_name for acc_id, acc_name in cur.fetchall()}


def get_account_id_by_name(account_name: str) -> int | None:
    """
    Retrieves the account ID from the database based on the account name.
    Returns the account ID or None if not found.
    """
    with db_cursor() as cur:
        cur.execute("SELECT id FROM accounts WHERE name = %s AND user_id = %s", (account_name, get_user_id()))
        result = cur.fetchone()
        return result[0] if result else None


def get_account_id_by_slug(account_slug: str) -> int | None:
    """
    Retrieves the account ID from the database based on the account slug.
    Returns the account ID or None if not found.
    """
    with db_cursor() as cur:
        cur.execute("SELECT id FROM accounts WHERE slug = %s AND user_id = %s", (account_slug, get_user_id()))
        result = cur.fetchone()
        return result[0] if result else None


def get_or_create_account(account_name: str) -> int:
    """
    Retrieves the account ID for a given account name, creating it if it doesn't exist.
    """
    account_id = get_account_id_by_name(account_name)
    if account_id:
        return account_id

    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO accounts (name, user_id) VALUES (%s, %s) RETURNING id",
            (account_name, get_user_id())
        )
        new_account_id = cur.fetchone()[0]
        logger.info(f"Created new account: {account_name}")
        return new_account_id


def get_account_id_by_slug_or_fail(account_slug: str) -> int:
    """
    Retrieves the account ID for a given account slug.
    Raises ValueError if account is not found (since slugs should already exist).
    """
    account_id = get_account_id_by_slug(account_slug)
    if account_id is None:
        raise ValueError(f"Account with slug '{account_slug}' not found")
    return account_id


def get_or_create_accounts_bulk(account_names: List[str]) -> Tuple[Dict[str, int], List[Dict]]:
    """
    Retrieves IDs for a list of account names, creating new accounts in bulk if they don't exist.
    Returns (account_id_map, newly_created) where newly_created is a list of {id, name} dicts
    for accounts that were created in this call (not pre-existing ones).
    """
    account_id_map: Dict[str, int] = {}
    newly_created: List[Dict] = []
    if not account_names:
        return account_id_map, newly_created

    try:
        with db_cursor(commit=True) as cur:
            # Fetch existing active accounts only — archived accounts cannot receive new transactions
            cur.execute("SELECT id, name FROM accounts WHERE name = ANY(%s) AND user_id = %s AND is_active = true", (list(account_names), get_user_id()))
            for acc_id, acc_name in cur.fetchall():
                account_id_map[acc_name] = acc_id

            # Identify accounts that need to be created
            accounts_to_create = [(name,) for name in account_names if name not in account_id_map]

            if accounts_to_create:
                logger.info(f"Creating {len(accounts_to_create)} new accounts in bulk.")
                # Update accounts_to_create to include user_id
                accounts_to_create_with_user = [(name, get_user_id()) for name, in accounts_to_create]
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO accounts (name, user_id) VALUES %s RETURNING id, name",
                    accounts_to_create_with_user
                )
                for acc_id, acc_name in cur.fetchall():
                    account_id_map[acc_name] = acc_id
                    newly_created.append({'id': acc_id, 'name': acc_name})
                logger.info(f"Successfully created {len(accounts_to_create)} accounts: {accounts_to_create}")
            else:
                logger.info("All accounts already exist.")
    except Exception as e:
        logger.error(f"Error in bulk account creation: {e}")
        raise
    return account_id_map, newly_created

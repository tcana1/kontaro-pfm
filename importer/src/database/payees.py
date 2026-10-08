"""Historical payee→category distributions used by the categorizer."""
import logging
from typing import Dict, List

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def get_payee_category_distribution(payee_name: str) -> Dict[int, int]:
    """
    Fetches the distribution of categories for a given payee from past transactions.
    Returns a dictionary where keys are category_ids and values are their counts.
    """
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT s.category_id, COUNT(*)
            FROM transactions t
            JOIN transaction_splits s ON t.id = s.transaction_id
            WHERE t.payee ILIKE %s AND t.user_id = %s
            GROUP BY s.category_id;
            """,
            (payee_name, get_user_id())
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def get_payee_category_distribution_batch(payee_names: List[str]) -> Dict[str, Dict[int, int]]:
    """
    Fetches the distribution of categories for multiple payees from past transactions in a single batch.
    Returns a dictionary where keys are payee names (lowercase) and values are their category distributions.
    """
    if not payee_names:
        return {}

    all_distributions = {name.lower(): {} for name in payee_names}  # Initialize with empty dicts for all requested payees
    with db_cursor() as cur:
        # Use UNNEST to pass a list of payees and join with transactions
        cur.execute(
            """
            SELECT LOWER(t.payee), s.category_id, COUNT(*)
            FROM transactions t
            JOIN transaction_splits s ON t.id = s.transaction_id
            WHERE LOWER(t.payee) = ANY(%s) AND s.category_id != 0 AND t.user_id = %s
            GROUP BY LOWER(t.payee), s.category_id;
            """,
            (payee_names, get_user_id())
        )
        for payee, category_id, count in cur.fetchall():
            all_distributions[payee][category_id] = count
    return all_distributions

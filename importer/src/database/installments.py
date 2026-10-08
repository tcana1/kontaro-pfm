"""Category inference for installment (parcela) transactions."""
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def get_category_for_installment(payee: str, purchase_date: date, amount: Decimal, margin: float) -> Optional[int]:
    """
    Searches for past transactions with the same payee, similar purchase date (±1 day),
    and similar amount (within margin) to retrieve category_id.
    Returns category_id only if ALL past matching installments used the same category (100% consistency).
    Returns None if no matches found or if multiple categories were used historically.
    """
    category_id = None
    with db_cursor() as cur:
        amount_lower, amount_upper = _amount_bounds(amount, margin)

        # Calculate date bounds (±1 day)
        date_lower = purchase_date - timedelta(days=1)
        date_upper = purchase_date + timedelta(days=1)

        cur.execute(
            """
            WITH matching_transactions AS (
                SELECT DISTINCT ts.category_id, COUNT(*) as category_count
                FROM transactions t
                JOIN transaction_splits ts ON t.id = ts.transaction_id
                WHERE t.payee ILIKE %s
                AND t.purchase_date BETWEEN %s AND %s
                AND t.user_id = %s
                GROUP BY t.id, ts.category_id
                HAVING SUM(ts.amount) BETWEEN %s AND %s
            )
            SELECT category_id, SUM(category_count) as total_count
            FROM matching_transactions
            GROUP BY category_id;
            """,
            (payee, date_lower, date_upper, get_user_id(), amount_lower, amount_upper)
        )
        results = cur.fetchall()

        # Only return category if exactly one unique category was used across all matches
        if len(results) == 1:
            category_id = results[0][0]
            logger.debug(f"Found consistent category {category_id} for installment: {payee}, {purchase_date}, {amount}")
        elif len(results) > 1:
            logger.debug(f"Multiple categories found for installment {payee}, {purchase_date}, {amount}: {results}. Leaving uncategorized.")
        else:
            logger.debug(f"No matching installments found for: {payee}, {purchase_date}, {amount}")

    return category_id


def _amount_bounds(amount: Decimal, margin: float) -> tuple[Decimal, Decimal]:
    """Lower/upper bounds for matching SUM(ts.amount) within ±margin."""
    m = Decimal(str(margin))
    return amount - m, amount + m


def get_installment_categories_batch(installment_data: List[Dict[str, Any]], margin: float) -> Dict[str, Optional[int]]:
    """
    Searches for categories for multiple potential installment transactions using a single optimized batch query.
    installment_data is a list of dictionaries, each with 'payee', 'purchase_date', 'amount'.
    Returns a dictionary where keys are a string representation of (payee, purchase_date, amount) and values are category_ids.
    Only returns category_id if ALL past matching installments used the same category (100% consistency).
    """
    installment_categories = {}

    if not installment_data:
        return installment_categories

    with db_cursor() as cur:
        # Build the batch query conditions
        batch_conditions = []
        query_params = []

        for item in installment_data:
            payee = item['payee']
            purchase_date = item['purchase_date']
            amount = item['amount']
            amount_lower, amount_upper = _amount_bounds(amount, margin)

            # Calculate date bounds (±1 day)
            date_lower = purchase_date - timedelta(days=1)
            date_upper = purchase_date + timedelta(days=1)

            # Add this installment's condition to the batch
            batch_conditions.append("""
                (t.payee ILIKE %s
                 AND t.purchase_date BETWEEN %s AND %s
                 AND SUM(ts.amount) BETWEEN %s AND %s)
            """)
            query_params.extend([payee, date_lower, date_upper, amount_lower, amount_upper])

        # Execute single batch query to get all matching historical transactions
        batch_query = f"""
            WITH installment_matches AS (
                SELECT
                    LOWER(t.payee) as payee_lower,
                    t.purchase_date,
                    SUM(ts.amount) as total_amount,
                    ts.category_id,
                    COUNT(*) as transaction_count
                FROM transactions t
                JOIN transaction_splits ts ON t.id = ts.transaction_id
                WHERE t.user_id = %s
                GROUP BY t.id, ts.category_id, t.payee, t.purchase_date
                HAVING {' OR '.join(batch_conditions)}
            ),
            category_consistency AS (
                SELECT
                    payee_lower,
                    purchase_date,
                    total_amount,
                    category_id,
                    COUNT(*) OVER (PARTITION BY payee_lower, purchase_date, total_amount) as category_count_per_group
                FROM installment_matches
            )
            SELECT
                payee_lower,
                purchase_date,
                total_amount,
                category_id
            FROM category_consistency
            WHERE category_count_per_group = 1  -- Only entries with single consistent category
            ORDER BY payee_lower, purchase_date, total_amount;
        """

        # Execute the batch query
        cur.execute(batch_query, [get_user_id()] + query_params)
        batch_results = cur.fetchall()

        # Index results preserving global row order: bucket key is
        # (payee_lower, purchase_date); entries keep their batch_results index
        # so "first match wins" stays exactly as before. Items probe their own
        # date and the ±1-day neighbors, so O(items) total instead of O(n·results).
        results_by_key: dict[tuple[str, date], list[tuple[int, Decimal, Any]]] = {}
        for idx, result in enumerate(batch_results):
            payee_lower, purchase_date, total_amount, category_id = result
            results_by_key.setdefault((payee_lower, purchase_date), []).append(
                (idx, total_amount, category_id)
            )

        # Process results and match back to original installment requests
        margin_dec = Decimal(str(margin))
        for item in installment_data:
            payee = item['payee']
            purchase_date = item['purchase_date']
            amount = item['amount']
            key = f"{payee.lower()}_{purchase_date}_{amount}"

            # Find matching result from batch query
            best = None
            for candidate_date in (purchase_date - timedelta(days=1),
                                   purchase_date,
                                   purchase_date + timedelta(days=1)):
                for idx, result_amount, category_id in results_by_key.get(
                    (payee.lower(), candidate_date), []
                ):
                    if abs(amount - result_amount) <= margin_dec and (best is None or idx < best[0]):
                        best = (idx, category_id)
            found_category = best[1] if best is not None else None

            if found_category is not None:
                logger.debug(f"Found consistent category {found_category} for installment: {payee}, {purchase_date}, {amount}")
            installment_categories[key] = found_category
            if found_category is None:
                logger.debug(f"No consistent category found for installment: {payee}, {purchase_date}, {amount}")

    return installment_categories

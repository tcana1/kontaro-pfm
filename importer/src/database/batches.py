"""Import batch lifecycle and pending→posted reconciliation."""
import json as _json
import logging
from decimal import Decimal
from typing import Optional

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def create_import_batch(account_id: Optional[int], user_id: str, source: Optional[str],
                        transaction_count: int, total_amount: Decimal,
                        file_name: Optional[str] = None,
                        status: str = "running") -> str:
    """
    Creates one import_batches row for an import run and returns its uuid.
    Every transaction in the run gets stamped with this id, which lets the
    match matcher exclude same-batch candidates.
    """
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO import_batches (user_id, account_id, source, transaction_count, total_amount, file_name, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (user_id, account_id, source, transaction_count, total_amount, file_name, status)
            )
            batch_id = cur.fetchone()[0]
    except Exception as e:
        logger.error(f"Error creating import batch: {e}")
        raise
    logger.info(f"Created import batch {batch_id} for account {account_id} ({transaction_count} transactions).")
    return str(batch_id)


def finalize_import_batch(batch_id: str, inserted_count: int, failed_count: int,
                          status: str = "success", error_text: Optional[str] = None,
                          errors: Optional[list] = None,
                          total_amount: Optional[Decimal] = None):
    """
    Updates an import_batches row with the actual insert outcome after the run.
    When total_amount is given it replaces the pre-insert value (which counts
    duplicates) with the amount of the transactions actually inserted.
    """
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE import_batches
                SET inserted_count = %s, failed_count = %s, finished_at = now(),
                    status = %s, error_text = %s, errors = %s,
                    total_amount = COALESCE(%s, total_amount)
                WHERE id = %s;
                """,
                (inserted_count, failed_count, status, error_text, _json.dumps(errors or []),
                 total_amount, batch_id)
            )
    except Exception as e:
        # Deliberately swallowed: finalizing is bookkeeping, and raising here would
        # mask the real outcome of an import that already succeeded or failed.
        logger.error(f"Error finalizing import batch {batch_id}: {e}")
        return
    logger.info(f"Finalized import batch {batch_id}: status={status}, inserted={inserted_count}, failed={failed_count}.")


def abort_stale_batches() -> int:
    """Mark batches stuck in 'running' for over 1 hour as 'aborted'. Returns count aborted."""
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE import_batches
                SET status = 'aborted', finished_at = now(),
                    errors = '[{"code":"E_INTERNAL","message":"Process terminated unexpectedly"}]'::jsonb
                WHERE status = 'running'
                  AND user_id = %s
                  AND created_at < now() - INTERVAL '1 hour'
                """,
                (get_user_id(),)
            )
            count = cur.rowcount
    except Exception as e:
        logger.error(f"Error aborting stale batches: {e}")
        return 0
    if count:
        logger.warning(f"Aborted {count} stale import batch(es).")
    return count


def create_and_fail_batch(account_id: Optional[int], source: Optional[str],
                          file_name: Optional[str], error_code: str, error_text: str) -> str:
    """Create an import_batches row that immediately transitions to failed.

    Used when a pipeline error occurs before any transactions are inserted
    (e.g. parse failure, unsupported layout, bad PDF password).
    """
    truncated = error_text[:500]
    batch_id = create_import_batch(
        account_id, get_user_id(), source, 0, Decimal(0), file_name, status='running'
    )
    finalize_import_batch(
        batch_id, 0, 0,
        status='failed',
        error_text=truncated,
        errors=[{"code": error_code, "message": truncated}],
    )
    return batch_id



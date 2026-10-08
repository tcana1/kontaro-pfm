"""Transaction insert path, duplicate detection, and status updates."""
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List

import psycopg2.extras

from src.context import get_user_id
from src.database.connection import db_connection, db_cursor
from src.processing.transaction_model import (
    CategorizedTransaction,
    Transaction,
    TransactionSplit,
)

logger = logging.getLogger(__name__)


@dataclass
class InsertResult:
    inserted: int
    duplicates: int
    failed: int
    errors: list = field(default_factory=list)
    inserted_amount: Decimal = Decimal(0)


_TX_INSERT_COLUMNS = (
    "INSERT INTO transactions (unique_hash, account_id, payment_date, purchase_date, "
    "payee, status_id, is_ignored, installment_number, installment_total, statement_identifier, "
    "import_batch_id, user_id)"
)
_TX_INSERT_SQL = _TX_INSERT_COLUMNS + "\nVALUES %s\nON CONFLICT (unique_hash) DO NOTHING"
_TX_INSERT_RETURNING_SQL = _TX_INSERT_SQL + "\nRETURNING unique_hash;"
_SPLITS_INSERT_SQL = "INSERT INTO transaction_splits (transaction_id, category_id, amount, observation)\nVALUES %s;"


def _transaction_row(tx: Transaction) -> tuple:
    """Column tuple for the transactions INSERT (12 cols)."""
    return (
        tx.unique_hash,
        tx.account_id,
        tx.payment_date,
        tx.purchase_date,
        tx.payee,
        tx.status_id,
        tx.is_ignored,
        tx.installment_number,
        tx.installment_total,
        tx.statement_identifier,
        tx.import_batch_id,
        get_user_id()
    )


def _split_row(tx: Transaction, cat_tx: CategorizedTransaction, transaction_id: int,
               split: TransactionSplit) -> tuple:
    """Column tuple for one transaction_splits row (category fallback to cat, then 0)."""
    category_id = split.category_id if split.category_id is not None else (cat_tx.category_id if cat_tx.category_id is not None else 0)
    return (transaction_id, category_id, split.amount, split.notes)


def _insert_transactions_batch(conn, cur, categorized_transactions: List[CategorizedTransaction], batch_size: int) -> tuple[List[CategorizedTransaction], set[str]]:
    failed_transactions = []
    inserted_hashes: set[str] = set()
    for i in range(0, len(categorized_transactions), batch_size):
        batch = categorized_transactions[i:i + batch_size]
        try:
            transactions_data = []
            unique_hashes_in_batch = []
            for cat_tx in batch:
                tx = cat_tx.transaction
                transactions_data.append(_transaction_row(tx))
                unique_hashes_in_batch.append(tx.unique_hash)

            # Batch insert transactions; RETURNING gives us only the hashes that were
            # actually inserted (duplicates are silently skipped by ON CONFLICT DO NOTHING)
            inserted_rows_data = psycopg2.extras.execute_values(
                cur,
                _TX_INSERT_RETURNING_SQL,
                transactions_data,
                fetch=True
            )
            newly_inserted_hashes = {row[0] for row in inserted_rows_data}
            inserted_rows = len(newly_inserted_hashes)
            logger.debug(f"Batch insert: {inserted_rows} new transactions inserted (out of {len(batch)} attempted).")

            # Get IDs for all transactions in the current batch (newly inserted or existing)
            # This is crucial to link splits to transactions, even if they were duplicates
            cur.execute(
                """
                SELECT id, unique_hash FROM transactions WHERE unique_hash = ANY(%s) AND user_id = %s;
                """,
                (unique_hashes_in_batch, get_user_id())
            )
            transaction_id_map = {row[1]: row[0] for row in cur.fetchall()}

            # Prepare data for transaction_splits batch insert — only for newly inserted
            # transactions. Skipping duplicates prevents re-inserting stale splits that
            # would conflict with user-edited categories.
            splits_data = []
            for cat_tx in batch:
                tx = cat_tx.transaction
                transaction_id = transaction_id_map.get(tx.unique_hash)
                if transaction_id and tx.unique_hash in newly_inserted_hashes:
                    splits_data.extend(
                        _split_row(tx, cat_tx, transaction_id, split)
                        for split in tx.splits
                    )

            if splits_data:
                psycopg2.extras.execute_values(
                    cur,
                    _SPLITS_INSERT_SQL,
                    splits_data
                )
            conn.commit() # Commit after each successful batch
            # Only count hashes as inserted after the batch is durably committed
            inserted_hashes.update(newly_inserted_hashes)
        except Exception as e:
            conn.rollback() # Rollback the current batch if an error occurs
            logger.warning(f"Failed to insert a batch of transactions (size {len(batch)}): {e}")
            failed_transactions.extend(batch) # Add the entire failed batch to the list
    return failed_transactions, inserted_hashes


def _insert_transactions_individual(conn, cur, categorized_transactions: List[CategorizedTransaction]):
    """Returns (failed_transactions, row_errors, inserted_hashes)."""
    failed_transactions = []
    row_errors = []
    inserted_hashes: set[str] = set()
    for cat_tx in categorized_transactions:
        tx = cat_tx.transaction
        try:
            cur.execute(
                _TX_INSERT_SQL + "\nRETURNING id;",
                _transaction_row(tx)
            )
            result = cur.fetchone()

            if result is None:
                logger.debug(f"Individual insert: Transaction with hash {cat_tx.transaction.unique_hash} was a duplicate and skipped.")
                # Transaction was a duplicate, not a failure, so it's not added to failed_transactions
                conn.commit() # Commit individual successful insert
                continue

            transaction_id = result[0]

            splits_data = [
                _split_row(tx, cat_tx, transaction_id, split)
                for split in tx.splits
            ]

            psycopg2.extras.execute_values(
                cur,
                _SPLITS_INSERT_SQL,
                splits_data
            )
            conn.commit() # Commit individual successful insert
            # Only count the hash as inserted after the individual commit succeeds
            inserted_hashes.add(tx.unique_hash)
        except Exception as e:
            conn.rollback() # Rollback the current individual transaction
            logger.error(f"Failed to insert individual transaction: {cat_tx}. Error: {e}")
            failed_transactions.append(cat_tx) # Add the failed transaction to the list
            row_errors.append({
                "code": "E_ROW_INSERT_FAILED",
                "message": str(e)[:300],
                "payee": tx.payee,
                "date": str(tx.payment_date),
            })
    return failed_transactions, row_errors, inserted_hashes


def _compute_insert_result(inserted_hashes: set[str], pre_checked_duplicates: int,
                           remaining_transactions: List[CategorizedTransaction],
                           row_errors: List[Dict[str, Any]],
                           inserted_amount: Decimal = Decimal(0)) -> InsertResult:
    """Builds the InsertResult, truncating row_errors at MAX_ERRORS_PER_BATCH."""
    from src.exceptions import MAX_ERRORS_PER_BATCH, ErrorCode

    if len(row_errors) > MAX_ERRORS_PER_BATCH:
        suppressed = len(row_errors) - MAX_ERRORS_PER_BATCH
        row_errors = row_errors[:MAX_ERRORS_PER_BATCH] + [{"code": ErrorCode.MORE_ERRORS, "suppressed": suppressed}]

    return InsertResult(
        inserted=len(inserted_hashes),
        duplicates=pre_checked_duplicates,
        failed=len(remaining_transactions),
        errors=row_errors,
        inserted_amount=inserted_amount,
    )


def insert_transactions(categorized_transactions: List[CategorizedTransaction]) -> InsertResult:
    """
    Inserts a list of categorized transactions into the database using batching with retry logic.
    Transactions are committed in batches, and failed batches are retried individually.
    Uses the unique_hash to prevent inserting duplicate transactions.

    Batch lifecycle (create/finalize) is owned by run_pipeline(); each transaction is expected
    to already have import_batch_id stamped before this function is called.
    """
    total_transactions = len(categorized_transactions)
    if not categorized_transactions:
        logger.info("No transactions to insert.")
        return InsertResult(inserted=0, duplicates=0, failed=0)

    with db_connection() as conn:
        with conn.cursor() as cur:
            BATCH_SIZE = 50 # As discussed

            logger.info(f"Attempting to insert {total_transactions} transactions in batches of {BATCH_SIZE}...")

            # Pre-check for existing transactions and log them
            all_unique_hashes = [tx.transaction.unique_hash for tx in categorized_transactions]
            existing_hashes_in_db = get_existing_transaction_hashes(all_unique_hashes)
            logger.debug(f"Found {len(existing_hashes_in_db)} existing hashes from the import that are in the database.")

            pre_checked_duplicates = 0
            for tx in categorized_transactions:
                #logger.debug(f"Checking transaction: {tx}")
                if tx.transaction.unique_hash in existing_hashes_in_db:
                    logger.warning(f"Transaction skipped, hash already exists in DB: hash={tx.transaction.unique_hash}, date={tx.transaction.payment_date}")
                    pre_checked_duplicates += 1

            failed_from_batch, batch_inserted_hashes = _insert_transactions_batch(conn, cur, categorized_transactions, batch_size=BATCH_SIZE)

            if failed_from_batch:
                logger.warning(f"{len(failed_from_batch)} transactions failed during batch insert. Retrying them individually.")
                failed_from_individual, row_errors, individual_inserted_hashes = _insert_transactions_individual(conn, cur, failed_from_batch)
                remaining_transactions = failed_from_individual
            else:
                remaining_transactions = []
                row_errors = []
                individual_inserted_hashes = set()

            # Count comes from the actual RETURNING set (batch + individual), not arithmetic
            successfully_inserted_hashes = batch_inserted_hashes | individual_inserted_hashes
            successfully_inserted_count = len(successfully_inserted_hashes)
            total_inserted_amount = Decimal(0)

            if successfully_inserted_count > 0:
                # Calculate the sum of amounts for successfully inserted transactions.
                # Transaction.amount sums every split (and returns 0 for empty splits),
                # so multi-split transactions are counted in full without IndexError.
                total_inserted_amount = sum(
                    tx.transaction.amount
                    for tx in categorized_transactions
                    if tx.transaction.unique_hash in successfully_inserted_hashes
                )

                logger.info(f"Successfully inserted {successfully_inserted_count} new transactions with a total amount of {total_inserted_amount:,.2f}.")
            if remaining_transactions:
                logger.error(f"Failed to insert {len(remaining_transactions)} transactions after all retries.")
            else:
                logger.info("All transactions processed successfully or were duplicates.")

            return _compute_insert_result(
                successfully_inserted_hashes,
                pre_checked_duplicates,
                remaining_transactions,
                row_errors,
                total_inserted_amount,
            )


def get_existing_statement_identifiers(account_id: int, statement_identifiers: List[str]) -> set[str]:
    """Returns which of the given statement_identifiers already exist for the account."""
    if not statement_identifiers:
        return set()

    with db_cursor() as cur:
        cur.execute(
            "SELECT statement_identifier FROM transactions "
            "WHERE statement_identifier = ANY(%s) AND account_id = %s AND user_id = %s",
            (statement_identifiers, account_id, get_user_id())
        )
        return {row[0] for row in cur.fetchall()}


def get_existing_transaction_hashes(unique_hashes: List[str]) -> set[str]:
    """
    Checks which of the given unique_hashes already exist in the transactions table.
    Returns a set of existing unique_hashes.
    """
    if not unique_hashes:
        return set()

    with db_cursor() as cur:
        cur.execute(
            "SELECT unique_hash FROM transactions WHERE unique_hash = ANY(%s) AND user_id = %s",
            (unique_hashes, get_user_id())
        )
        return {row[0] for row in cur.fetchall()}


def update_transaction_status(transaction_id: int, status_id: int) -> bool:
    """Updates status_id for a transaction. Never overwrites Cleared (2).
    Returns True if the row was updated, False if the guard prevented it."""
    with db_cursor(commit=True) as cur:
        cur.execute(
            """UPDATE transactions
               SET status_id = %s
               WHERE id = %s AND user_id = %s AND status_id NOT IN (2)
               RETURNING id""",
            (status_id, transaction_id, get_user_id()),
        )
        return cur.fetchone() is not None

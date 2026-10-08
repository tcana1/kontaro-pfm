# src/pipeline.py
import logging
from dataclasses import dataclass
from typing import List, Optional

from src.context import get_user_id
from src.database import db_handler
from src.database.db_handler import InsertResult
from src.processing import categorizer, normalizer
from src.processing.transaction_model import CategorizedTransaction, Transaction

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    categorized: List[CategorizedTransaction]
    insert_result: Optional[InsertResult]  # None when dry_run=True


def run_pipeline(
    transactions: List[Transaction],
    account_id: int,
    source: str,
    file_name: Optional[str] = None,
    dry_run: bool = False,
) -> PipelineResult:
    """
    Executes the full data processing pipeline.

    Owns the import_batches lifecycle: creates the row with status='running' after
    categorization (so counts are accurate), finalizes on success/partial/failure.
    dry_run skips all DB writes including batch creation.
    """
    logger.info(f"Starting pipeline for {file_name or source} (Account ID: {account_id})...")

    for tx in transactions:
        tx.source_file = source
        tx.account_id = account_id

    logger.info("Normalizing transactions...")
    normalized_transactions = normalizer.normalize_transactions(transactions)

    logger.info("Categorizing transactions...")
    categorized_transactions = categorizer.categorize_transactions(normalized_transactions)

    if dry_run:
        logger.info("Dry run enabled. Skipping database insertion.")
        return PipelineResult(categorized=categorized_transactions, insert_result=None)

    # Sweep any batches that were left in 'running' by a prior crash.
    db_handler.abort_stale_batches()

    total_amount = sum(ct.transaction.amount for ct in categorized_transactions)
    batch_id = db_handler.create_import_batch(
        account_id=account_id,
        user_id=get_user_id(),
        source=source,
        transaction_count=len(categorized_transactions),
        total_amount=total_amount,
        file_name=file_name,
        status='running',
    )
    for ct in categorized_transactions:
        ct.transaction.import_batch_id = batch_id

    try:
        logger.info("Inserting transactions into database...")
        insert_result = db_handler.insert_transactions(categorized_transactions)

        if insert_result.failed == 0:
            status = 'success'
        elif insert_result.inserted > 0:
            status = 'partial'
        else:
            status = 'failed'

        db_handler.finalize_import_batch(
            batch_id,
            insert_result.inserted,
            insert_result.failed,
            status=status,
            errors=insert_result.errors,
            total_amount=insert_result.inserted_amount,
        )
    except Exception as e:
        db_handler.finalize_import_batch(
            batch_id, 0, 0,
            status='failed',
            error_text=str(e)[:500],
            errors=[],
        )
        raise

    logger.info("Pipeline completed successfully.")
    return PipelineResult(categorized=categorized_transactions, insert_result=insert_result)

# src/services/import_service.py
"""Core import logic, callable by any source (HTTP handler, Pluggy sync, etc.)."""

import logging
from dataclasses import dataclass
from typing import List

from src.database import db_handler
from src.pipeline import run_pipeline
from src.processing import normalizer
from src.processing.transaction_model import Transaction

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    transaction_count: int
    inserted: int
    duplicates: int
    failed: int
    total_amount: float
    dry_run: bool


def import_batch(
    account_slug: str,
    transactions: List[Transaction],
    source: str,
    dry_run: bool,
) -> ImportResult:
    """Import a batch of Transaction objects for a given account slug.

    Raises:
        ValueError: if account_slug is not found (propagated from db_handler).
    """
    # 1. Resolve account; let ValueError propagate so callers can handle it.
    account_id = db_handler.get_account_id_by_slug_or_fail(account_slug)

    # 2. Stamp each transaction with account_id and source.
    for tx in transactions:
        tx.account_id = account_id
        tx.source_file = source

    # 3. Pre-check duplicates before running the pipeline.
    pre_normalized = normalizer.normalize_transactions(list(transactions))
    all_hashes = [tx.unique_hash for tx in pre_normalized]
    existing_hashes = db_handler.get_existing_transaction_hashes(all_hashes)
    duplicate_count = len(existing_hashes)

    # 4. Run the full pipeline (normalize → categorize → [insert]).
    pipeline_result = run_pipeline(
        transactions=transactions,
        account_id=account_id,
        source=source,
        dry_run=dry_run,
    )
    categorized = pipeline_result.categorized

    total_amount = float(sum(ct.transaction.amount for ct in categorized))
    transaction_count = len(categorized)

    # 5. Use real counts from the insert result; fall back to pre-check estimate on dry_run.
    if dry_run:
        inserted = transaction_count
        failed = 0
    else:
        ir = pipeline_result.insert_result
        inserted = ir.inserted if ir else 0
        failed = ir.failed if ir else 0

    duplicates = duplicate_count

    logger.info(
        f"import_batch complete — account: {account_slug}, total: {transaction_count}, "
        f"inserted: {inserted}, duplicates: {duplicates}, "
        f"failed: {failed}, dry_run: {dry_run}"
    )

    return ImportResult(
        transaction_count=transaction_count,
        inserted=inserted,
        duplicates=duplicates,
        failed=failed,
        total_amount=total_amount,
        dry_run=dry_run,
    )

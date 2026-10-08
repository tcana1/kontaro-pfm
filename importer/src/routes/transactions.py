import asyncio
import contextvars
import functools
import io
import json
import logging
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Security, UploadFile

from src.auth import get_current_user
from src.config import (
    MAGIC_BYTES,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    PROCESSING_TIMEOUT_SECONDS,
)
from src.context import get_user_id
from src.database import batches as batch_db
from src.database import db_handler
from src.models.import_models import (
    CreatedAccount,
    ImportRequest,
    ImportResponse,
    PreviewTransaction,
    StatusUpdateRequest,
    StatusUpdateResponse,
)
from src.processing.transaction_model import Transaction, TransactionSplit
from src.services import import_service
from src.utils import excel_to_postgres

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions")

_EXCEL_HISTORY_EXTENSIONS = {".xls", ".xlsx", ".xlsm"}
VALID_STATUS_IDS = {1, 2}


@router.post("/import", response_model=ImportResponse)
async def import_transactions(
    body: ImportRequest,
    _auth: str = Security(get_current_user)
):
    """
    Imports a batch of transactions from structured JSON.

    - **account_slug**: The account slug all transactions belong to.
    - **dry_run**: If true, transactions are processed but not saved to the database.
    - **source**: Optional label for tracking the import origin (e.g. 'open-finance-script').
    - **transactions**: List of transaction objects. Each must have at least one split with an amount.
    """
    logger.info(f"Received batch import request: {len(body.transactions)} transactions for account '{body.account_slug}'")

    source = body.source or "api-import"

    transactions: List[Transaction] = []
    for t in body.transactions:
        splits = [
            TransactionSplit(
                amount=s.amount,
                category_id=s.category_id,
                notes=s.notes,
            )
            for s in t.splits
        ]
        transactions.append(Transaction(
            payment_date=t.payment_date,
            purchase_date=t.purchase_date,
            payee=t.payee,
            status_id=t.status_id,
            statement_identifier=t.statement_identifier,
            installment_number=t.installment_number,
            installment_total=t.installment_total,
            splits=splits,
        ))

    try:
        result = import_service.import_batch(
            account_slug=body.account_slug,
            transactions=transactions,
            source=source,
            dry_run=body.dry_run,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during batch import: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Internal server error during import.")

    return ImportResponse(
        success=True,
        transaction_count=result.transaction_count,
        inserted=result.inserted,
        duplicates=result.duplicates,
        failed=result.failed,
        total_amount=result.total_amount,
        dry_run=result.dry_run,
    )


@router.post("/import-excel", response_model=ImportResponse)
async def import_excel_history(
    file: UploadFile = File(...),
    column_mapping: Optional[str] = Form(None),
    dry_run: bool = Form(False),
    _auth: str = Security(get_current_user),
):
    """
    Imports a categorized transaction history from an Excel file (.xls, .xlsx or .xlsm).

    Accounts and categories referenced in the file are created automatically if they don't exist.
    The default column mapping expects the headers Account, Date, Payee, Category ("Group:Category"),
    Amount, Status and Notes. Pass `column_mapping` as a JSON object to use different headers.
    """
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _EXCEL_HISTORY_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Only .xls, .xlsx and .xlsm files are supported. Received: {ext}")

    if file.size is not None and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB.")

    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB.")

    expected_magic = MAGIC_BYTES[".xls"] if ext == ".xls" else MAGIC_BYTES[".xlsx"]  # xlsx and xlsm are both ZIP
    if not file_content.startswith(expected_magic):
        raise HTTPException(status_code=400, detail="File content does not match declared type.")

    parsed_mapping = None
    if column_mapping:
        try:
            parsed_mapping = json.loads(column_mapping)
            if not isinstance(parsed_mapping, dict):
                raise ValueError("column_mapping must be a JSON object")
        except (ValueError, json.JSONDecodeError):
            raise HTTPException(status_code=400, detail="column_mapping must be a valid JSON object.")

    ctx = contextvars.copy_context()
    loop = asyncio.get_event_loop()
    try:
        categorized, skipped, skip_details, newly_created_accounts = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                ctx.run,
                functools.partial(
                    excel_to_postgres.process_excel_file,
                    io.BytesIO(file_content),
                    None,
                    parsed_mapping,
                    dry_run,
                    ext,
                ),
            ),
            timeout=PROCESSING_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Processing timed out.")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Error processing Excel history file: %s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Failed to process the Excel file.")

    transaction_count = len(categorized)
    total_amount = float(sum(ct.transaction.amount for ct in categorized))

    if dry_run:
        preview_txns = [
            PreviewTransaction(
                purchase_date=ct.transaction.purchase_date,
                payee=ct.transaction.payee,
                amount=float(ct.transaction.amount),
                category=ct.category_name,
            )
            for ct in categorized[:10]
        ]
        return ImportResponse(
            success=True,
            transaction_count=transaction_count,
            inserted=transaction_count,
            duplicates=0,
            skipped=skipped,
            skip_details=skip_details,
            failed=0,
            total_amount=total_amount,
            dry_run=True,
            transactions=preview_txns,
        )

    # Create a batch record so this import appears in the Activity tab.
    # account_id is NULL because the Excel history import spans multiple accounts.
    def _create_batch():
        return batch_db.create_import_batch(
            account_id=None,
            user_id=get_user_id(),
            source='excel-history',
            transaction_count=transaction_count,
            total_amount=Decimal(str(total_amount)),
            file_name=file.filename,
        )

    batch_id = await loop.run_in_executor(None, ctx.run, _create_batch)

    for ct in categorized:
        ct.transaction.import_batch_id = batch_id

    try:
        result = await loop.run_in_executor(
            None,
            ctx.run,
            functools.partial(db_handler.insert_transactions, categorized),
        )
    except Exception as e:
        logger.exception("Error inserting Excel history transactions: %s", type(e).__name__)
        await loop.run_in_executor(None, ctx.run, functools.partial(
            batch_db.finalize_import_batch, batch_id, 0, transaction_count, 'failed', str(e)[:500],
        ))
        raise HTTPException(status_code=500, detail="Failed to insert transactions.")

    batch_status = 'success' if result.failed == 0 else ('partial' if result.inserted > 0 else 'failed')
    await loop.run_in_executor(None, ctx.run, functools.partial(
        batch_db.finalize_import_batch, batch_id, result.inserted, result.failed, batch_status,
        total_amount=result.inserted_amount,
    ))

    return ImportResponse(
        success=True,
        transaction_count=transaction_count,
        inserted=result.inserted,
        duplicates=result.duplicates,
        skipped=skipped,
        skip_details=skip_details,
        failed=result.failed,
        total_amount=total_amount,
        dry_run=False,
        accounts_created=[CreatedAccount(id=a['id'], name=a['name']) for a in newly_created_accounts],
    )


@router.patch("/{transaction_id}/status", response_model=StatusUpdateResponse)
async def patch_transaction_status(
    transaction_id: int,
    body: StatusUpdateRequest,
    _auth: str = Security(get_current_user),
):
    """
    Updates a transaction's status_id.
    Never overwrites Cleared (2) — returns updated=false in that case.
    """
    if body.status_id not in VALID_STATUS_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status_id {body.status_id}. Valid values: {sorted(VALID_STATUS_IDS)}",
        )
    updated = db_handler.update_transaction_status(transaction_id, body.status_id)
    return StatusUpdateResponse(success=True, updated=updated)

import asyncio
import contextvars
import functools
import json
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query,
    Security,
    UploadFile,
)
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from src.auth import get_current_user
from src.config import (
    ALLOWED_FILE_EXTENSIONS,
    ALLOWED_FILE_TYPES,
    MAGIC_BYTES,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    PROCESSING_TIMEOUT_SECONDS,
)
from src.exceptions import EmptyStatementError, ParserError, UnsupportedLayoutError
from src.output import csv_writer, excel_writer, json_writer
from src.processing.transaction_model import CategorizedTransaction
from src.utils.processing_utils import process_statement_file

logger = logging.getLogger(__name__)

router = APIRouter()

# ── File validation ───────────────────────────────────────────────────────────

async def _validate_upload(file: UploadFile) -> tuple[str, bytes]:
    """Extension/content-type/size/magic-bytes validation. Raises HTTPException on bad input."""
    file_extension = os.path.splitext(file.filename or "")[1].lower()

    if file_extension not in ALLOWED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension. Only PDF, XLS, and XLSX files are allowed. Received: {file_extension}"
        )

    # For .xls files, be more lenient with MIME type detection as they're often detected as application/octet-stream
    if file_extension == ".xls" and file.content_type not in ["application/vnd.ms-excel", "application/octet-stream"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type for .xls file. Received: {file.content_type}"
        )
    elif file_extension != ".xls" and file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only PDF, XLS, and XLSX files are allowed. Received: {file.content_type}"
        )

    # Reject obviously-oversized files before reading into RAM (Content-Length can be
    # spoofed, so the post-read check below is still required as the authoritative guard).
    if file.size is not None and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB."
        )

    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB."
        )

    # Magic-bytes check: reject files whose content doesn't match the declared extension.
    expected_magic = MAGIC_BYTES.get(file_extension)
    if expected_magic and not file_content.startswith(expected_magic):
        raise HTTPException(status_code=400, detail="File content does not match declared type.")

    return file_extension, file_content


# ── Error mapping ─────────────────────────────────────────────────────────────

_VALUE_ERROR_CODES = ("AMBIGUOUS", "NOT_FOUND")


def _map_value_error(e: ValueError) -> HTTPException:
    """Maps the ValueError prefixes raised by the pipeline to their HTTP contract."""
    msg = str(e)
    for prefix in _VALUE_ERROR_CODES:
        if msg.startswith(prefix + ":"):
            _, _, payload = msg.partition(":")
            return HTTPException(
                status_code=422,
                detail={
                    "code": prefix.lower(),
                    "file_info": json.loads(payload),
                    "message": "Could not determine account — please specify account_id"
                }
            )
    if msg.startswith("PDF_PASSWORD_FAILED:"):
        return HTTPException(status_code=422, detail={"code": "pdf_password_failed", "message": msg})
    return HTTPException(status_code=400, detail=msg)


def _map_pipeline_exception(e: Exception) -> HTTPException:
    """Maps pipeline exceptions (layout/parser) to their HTTP contract; unknown -> re-raise for the 500 handler."""
    if isinstance(e, UnsupportedLayoutError):
        return HTTPException(status_code=422, detail={"code": "unsupported_layout", "message": str(e)})
    if isinstance(e, ParserError):
        logger.error("Parser failure: %s", e)
        return HTTPException(status_code=422, detail={"code": "parser_failure", "message": str(e)})
    raise e  # unknown exception — let the generic 500 handler deal with it


# ── Output rendering ──────────────────────────────────────────────────────────

def _output_formats_list(output_format: Optional[str]) -> List[str]:
    if output_format is None:
        return ["excel"]
    return [fmt.strip().lower() for fmt in output_format.split(',')]


_OUTPUT_EXTENSIONS = {"excel": "xlsx", "json": "json", "csv": "csv"}


def _generate_outputs(categorized_transactions: List[CategorizedTransaction],
                      output_formats_list: List[str], temp_dir: str) -> tuple[dict, Optional[list]]:
    """Generates requested file outputs; returns ({fmt: path}, json_data_or_None)."""
    response_files = {}
    transactions_data = None

    for fmt in output_formats_list:
        if fmt == "none":
            logger.info("Headers-only response requested (none format)")
            continue
        if fmt not in _OUTPUT_EXTENSIONS:
            logger.warning(f"Unsupported output format requested: {fmt}")
            raise HTTPException(status_code=400, detail=f"Unsupported output format: {fmt}. Choose from 'excel', 'json', 'csv', 'none'.")

        output_filename_base = f"processed_statement_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        output_path = os.path.join(temp_dir, f"{output_filename_base}.{_OUTPUT_EXTENSIONS[fmt]}")

        if fmt == "excel":
            response_files['excel'] = excel_writer.save_to_excel(categorized_transactions, output_filepath=output_path)
            logger.info("Generated Excel output")
        elif fmt == "csv":
            response_files['csv'] = csv_writer.save_to_csv(categorized_transactions, output_path=output_path)
            logger.info("Generated CSV output")
        elif fmt == "json":
            json_writer.save_to_json(categorized_transactions, output_path=output_path)
            with open(output_path, 'r', encoding='utf-8') as f:
                transactions_data = json.load(f)
            logger.info("Generated JSON data for response")

    return response_files, transactions_data


def _add_standard_headers(response, transaction_count: int, total_amount):
    response.headers["X-Success"] = "true"
    response.headers["X-Transaction-Count"] = str(transaction_count)
    response.headers["X-Total-Amount"] = str(total_amount)
    return response


def _empty_statement_response():
    response = JSONResponse(content={
        "success": True,
        "status": "empty",
        "transaction_count": 0,
        "total_amount": 0,
        "message": "Statement parsed successfully but contains no transactions.",
    }, status_code=200)
    response.headers["X-Success"] = "true"
    response.headers["X-Transaction-Count"] = "0"
    response.headers["X-Parse-Status"] = "empty"
    return response


def _no_transactions_response():
    response = JSONResponse(content={
        "success": True,
        "transaction_count": 0,
        "total_amount": 0,
        "message": "No transactions processed.",
    })
    response.headers["X-Success"] = "true"
    response.headers["X-Transaction-Count"] = "0"
    response.headers["X-Total-Amount"] = "0"
    return response


def _internal_error_response():
    error_response = {
        "success": False,
        "transaction_count": 0,
        "total_amount": 0,
        "message": "Internal server error during processing."
    }
    response = JSONResponse(content=error_response, status_code=500)
    response.headers["X-Success"] = "false"
    response.headers["X-Transaction-Count"] = "0"
    response.headers["X-Total-Amount"] = "0"
    return response


def _render_none(transaction_count, total_amount, **_):
    """Headers-only 204 response; temp_dir stays with the caller's finally cleanup."""
    from fastapi import Response
    response = Response(content="", status_code=204, media_type="text/plain")
    return _add_standard_headers(response, transaction_count, total_amount), True


def _render_excel(transaction_count, total_amount, response_files, temp_dir, **_):
    """Excel-only FileResponse; transfers temp_dir ownership to the background task."""
    path = response_files['excel']
    response = FileResponse(
        path=path,
        filename=os.path.basename(path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(shutil.rmtree, temp_dir, True),
    )
    return _add_standard_headers(response, transaction_count, total_amount), False


def _render_csv(transaction_count, total_amount, response_files, temp_dir, **_):
    """CSV-only FileResponse; same ownership-transfer pattern as Excel above."""
    path = response_files['csv']
    response = FileResponse(
        path=path,
        filename=os.path.basename(path),
        media_type="text/csv",
        background=BackgroundTask(shutil.rmtree, temp_dir, True),
    )
    return _add_standard_headers(response, transaction_count, total_amount), False


def _render_json(transaction_count, total_amount, transactions_data, **_):
    """JSON-only — standardized response with transaction data."""
    base_response = {
        "success": True,
        "transaction_count": transaction_count,
        "total_amount": float(total_amount),
        "message": "Processing successful",
        "data": {"transactions": transactions_data},
    }
    response = JSONResponse(content=base_response)
    return _add_standard_headers(response, transaction_count, total_amount), True


def _render_mixed(transaction_count, total_amount, response_files, transactions_data, **_):
    """Multiple formats or mixed - return JSON with transaction data if requested."""
    base_response = {
        "success": True,
        "transaction_count": transaction_count,
        "total_amount": float(total_amount),
        "message": "Processing successful",
    }
    if transactions_data:
        base_response["data"] = {"transactions": transactions_data}
        base_response["message"] = f"Processing successful. Generated {len(response_files)} additional file format(s)."
    else:
        base_response["message"] = f"Processing successful. Generated {len(response_files)} file format(s)."
    response = JSONResponse(content=base_response)
    return _add_standard_headers(response, transaction_count, total_amount), True


_RENDERERS = {
    "none": _render_none,
    "excel": _render_excel,
    "csv": _render_csv,
    "json": _render_json,
}


def _render_outputs(transaction_count: int, total_amount, output_formats_list: List[str],
                    response_files: dict, transactions_data: Optional[list], temp_dir: str) -> tuple[object, bool]:
    """Selects the response renderer via dispatch table. Returns (response, keep_temp_dir)."""
    kwargs = dict(
        transaction_count=transaction_count,
        total_amount=total_amount,
        response_files=response_files,
        transactions_data=transactions_data,
        temp_dir=temp_dir,
    )
    if len(output_formats_list) == 1 and output_formats_list[0] in _RENDERERS:
        return _RENDERERS[output_formats_list[0]](**kwargs)
    return _render_mixed(**kwargs)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/process-statement/")
async def process_statement(
    file: UploadFile = File(...),
    output_format: Optional[str] = Query("excel", description="Desired output format: 'excel', 'json', 'csv', or 'none'. Can be comma-separated for multiple formats (e.g., 'excel,json'). Use 'none' for headers-only response."),
    dry_run: bool = Query(False, description="If true, transactions will be processed but not inserted into the database."),
    account_id: Optional[int] = Query(None, description="Override the account ID (skips import-rules lookup)."),
    _auth: str = Security(get_current_user)
):
    """
    Processes an uploaded financial statement file.

    - **file**: The financial statement file (PDF, XLS, XLSX).
    - **output_format**: Desired output format(s) (e.g., 'excel', 'json', 'csv', 'none', 'excel,json'). Use 'none' for headers-only response.
    - **dry_run**: If true, transactions are processed but not saved to the database.
    """
    # 1. File Validation
    file_extension, file_content = await _validate_upload(file)
    logger.info(f"Processing file upload [ext={file_extension}, size_kb={len(file_content) // 1024}]")

    temp_dir = None
    keep_temp_dir = True
    try:
        # 2. Handle Temporary File Storage
        # Use a random name — never trust client-supplied filename in path construction.
        temp_dir = tempfile.mkdtemp()
        safe_name = f"{uuid.uuid4().hex}{file_extension}"
        temp_file_path = os.path.join(temp_dir, safe_name)
        with open(temp_file_path, "wb") as f:
            f.write(file_content)

        # 3. Core Processing — runs in a thread so it doesn't block the event loop (P1.12).
        fn = functools.partial(
            process_statement_file,
            file_path=temp_file_path,
            dry_run=dry_run,
            account_id_override=account_id,
            original_filename=file.filename,
        )
        try:
            ctx = contextvars.copy_context()
            categorized_transactions: List[CategorizedTransaction] = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, ctx.run, fn),
                timeout=PROCESSING_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error("Processing timed out after %s s", PROCESSING_TIMEOUT_SECONDS)
            raise HTTPException(status_code=504, detail="Processing timed out.")
        except EmptyStatementError:
            logger.warning("Statement parsed successfully but contains no transactions.")
            return _empty_statement_response()
        except ValueError as e:
            raise _map_value_error(e)
        except Exception as e:
            raise _map_pipeline_exception(e)

        # Calculate summary statistics
        transaction_count = len(categorized_transactions)
        total_amount = sum(trans.transaction.amount for trans in categorized_transactions)

        output_formats_list = _output_formats_list(output_format)
        if transaction_count == 0 and output_formats_list != ["none"]:
            return _no_transactions_response()

        # 4. Output Generation + 5/6. Standardized response selection
        response_files, transactions_data = _generate_outputs(
            categorized_transactions, output_formats_list, temp_dir
        )
        response, keep_temp_dir = _render_outputs(
            transaction_count, total_amount, output_formats_list, response_files, transactions_data, temp_dir
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during file processing: %s", type(e).__name__)
        return _internal_error_response()
    finally:
        # Clean up temp_dir on every path that didn't transfer ownership to a FileResponse.
        # FileResponse renderers return keep_temp_dir=False and attach cleanup as a response background task.
        if temp_dir is not None and keep_temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)

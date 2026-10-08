import logging
import os
from typing import List, Optional

from src.database import db_handler
from src.exceptions import (
    EmptyStatementError,
    ErrorCode,
    ParserError,
    UnsupportedLayoutError,
)
from src.parsers import (
    btg_parser,
    c6_global_eur_parser,
    c6_global_usd_parser,
    c6_parser,
    itau_account_parser,
    itau_credit_card_excel_parser,
    itau_parser,
    porto_parser,
    xp_parser,
)
from src.pipeline import run_pipeline
from src.processing.transaction_model import CategorizedTransaction
from src.utils import file_identifier
from src.utils.account_utils import resolve_account_id_from_rules

logger = logging.getLogger(__name__)

def process_statement_file(
    file_path: str,
    dry_run: bool = False,
    account_id_override: Optional[int] = None,
    original_filename: Optional[str] = None,
) -> List[CategorizedTransaction]:
    logger.info(f"Starting file processing for {file_path}...")

    # Fetch user's PDF passwords from DB (+ empty string for unprotected PDFs)
    pdf_passwords = [""] + db_handler.get_pdf_passwords_plaintext()

    # Phase 1 — file identification, account resolution.
    # Errors here have no account context, so no batch record is created.
    file_info = file_identifier.identify_file(file_path, password_list=pdf_passwords)
    logger.debug(f"Identified file info: {file_info}")

    if "error" in file_info:
        if "password" in file_info["error"].lower():
            raise ValueError("PDF_PASSWORD_FAILED:" + file_info["error"])
        raise ValueError(f"Error identifying file: {file_info['error']}")

    # original_filename is what filename_pattern rules should match against —
    # file_path is a random UUID name on disk (never trust client filenames in paths).
    filename = original_filename or os.path.basename(file_path)

    if account_id_override is not None:
        if db_handler.get_account_name_by_id(account_id_override) is None:
            raise ValueError(f"ACCOUNT_NOT_FOUND:Account {account_id_override} not found or access denied")
        account_id = account_id_override
    else:
        account_id, status = resolve_account_id_from_rules(file_info, filename=filename)
        if status in ("ambiguous", "not_found"):
            import json
            file_info_summary = {k: v for k, v in file_info.items() if k != "text"}
            raise ValueError(f"{status.upper()}:" + json.dumps(file_info_summary))

    # Phase 2 — account is known; parse errors from here create a failed batch record.
    bank = file_info.get("bank")
    file_format = file_info.get("format")
    source_label = f"{bank}-{file_format}" if bank else "file"
    display_name = original_filename or filename

    if file_info.get("format") == "pdf":
        password = file_identifier.find_pdf_password(file_path, password_list=pdf_passwords)
        if password is None:
            err = "Could not decrypt PDF with available passwords"
            if not dry_run:
                db_handler.create_and_fail_batch(account_id, source_label, display_name,
                                                 ErrorCode.PDF_PASSWORD, err)
            raise ValueError(f"PDF_PASSWORD_FAILED:{err}")
    else:
        password = None

    try:
        transactions = []
        if bank == 'itau':
            if file_format == 'pdf':
                transactions = itau_parser.extract_transactions_from_pdf(file_path, password)
            elif file_format == 'excel':
                file_type = file_info.get("type")
                if file_type == 'credit_card':
                    transactions = itau_credit_card_excel_parser.extract_transactions_from_xls(file_path)
                elif file_type == 'bank_account':
                    transactions = itau_account_parser.extract_transactions_from_xls(file_path)
                else:
                    raise ValueError(f"Unsupported Itau Excel type: {file_type}")
        elif bank == 'c6':
            if file_info.get("variant") == "global_eur":
                transactions = c6_global_eur_parser.extract_transactions(file_path, password)
            elif file_info.get("variant") == "global_usd":
                transactions = c6_global_usd_parser.extract_transactions(file_path, password)
            else:
                transactions = c6_parser.extract_transactions(file_path, password)
        elif bank == 'porto':
            transactions = porto_parser.extract_transactions(file_path, password)
        elif bank == 'btg':
            transactions = btg_parser.extract_transactions(file_path, password)
        elif bank == 'xp':
            transactions = xp_parser.extract_transactions(file_path, password)
        else:
            raise ValueError(f"Unsupported or unknown bank: {bank}")
    except EmptyStatementError:
        raise  # Legitimate empty period — no batch record
    except UnsupportedLayoutError as e:
        if not dry_run:
            db_handler.create_and_fail_batch(account_id, source_label, display_name,
                                             ErrorCode.UNSUPPORTED_LAYOUT, str(e))
        raise
    except (ValueError, ParserError) as e:
        if not dry_run:
            db_handler.create_and_fail_batch(account_id, source_label, display_name,
                                             ErrorCode.PARSER_FAILURE, str(e))
        raise
    except Exception as e:
        err_msg = f"Parser failed for {bank}/{file_format}: {e}"
        if not dry_run:
            db_handler.create_and_fail_batch(account_id, source_label, display_name,
                                             ErrorCode.PARSER_FAILURE, err_msg)
        raise ParserError(err_msg) from e

    if not transactions:
        logger.info("No transactions extracted from the file.")
        raise EmptyStatementError(f"No transactions found in {bank} {file_format} statement")

    result = run_pipeline(
        transactions=transactions,
        account_id=account_id,
        source=source_label,
        file_name=display_name,
        dry_run=dry_run,
    )
    return result.categorized

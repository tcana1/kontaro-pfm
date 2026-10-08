import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

import xlrd

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit

logger = logging.getLogger(__name__)

def extract_transactions_from_xls(file_path: str) -> List[Transaction]:
    logger.info(f"Starting to parse XLS file: {file_path}")
    try:
        book = xlrd.open_workbook(file_path)
        sheet = book.sheet_by_index(0)
        transactions = _process_sheet(sheet, book)
        logger.info(f"Successfully extracted {len(transactions)} transactions.")
        return transactions
    except FileNotFoundError:
        logger.error(f"Error: The file '{file_path}' was not found.")
        raise
    except Exception as e:
        logger.error(f"An error occurred while parsing the XLS file: {e}", exc_info=True)
        raise

def _process_sheet(sheet, book) -> List[Transaction]:
    transactions = []
    lancamentos_iniciados = False
    logger.info("Processing sheet to find transactions.")
    for row_idx in range(sheet.nrows):
        row = sheet.row_values(row_idx)
        logger.debug(f"Processing row {row_idx}: {row}")

        if not lancamentos_iniciados:
            if any("lançamentos" in str(cell).lower() for cell in row):
                lancamentos_iniciados = True
                logger.info("Found the start of transactions section.")
            continue

        if any("lançamentos futuros" in str(cell).lower() for cell in row):
            logger.info("Found 'lançamentos futuros' marker, stopping processing.")
            break

        if len(row) < 4 or not row[3] or any(str(cell).lower().strip() in ['data', 'lançamento', 'valor', 'valor (r$)'] for cell in row):
            logger.debug(f"Skipping row {row_idx} as it appears to be a header or empty.")
            continue

        transaction = _create_transaction_from_row(row, book)
        if transaction:
            logger.debug(f"Successfully created transaction from row {row_idx}.")
            transactions.append(transaction)

    if not lancamentos_iniciados:
        raise UnsupportedLayoutError(
            "No 'lançamentos' section found in Itaú account Excel — "
            "the column layout may have changed (e.g. extra column inserted)"
        )

    return transactions

def _create_transaction_from_row(row, book) -> Optional[Transaction]:
    logger.debug(f"Attempting to create transaction from row: {row}")
    try:
        date_obj = _formatar_data(row[0], book)
        if not date_obj:
            logger.warning(f"Could not parse date from row: {row}. Skipping.")
            return None

        description = _ajustar_descricao(row[1])
        
        value = row[3]
        amount = None

        # xlrd reads numeric cells as floats.
        if isinstance(value, float):
            # Convert to Decimal via string to avoid precision issues.
            amount = Decimal(str(value))
        elif isinstance(value, str):
            value_str = value.strip()
            if not value_str:
                logger.warning(f"Empty value string found in row: {row}. Skipping.")
                return None
            
            # Handle Brazilian currency format: "1.234,56" -> "1234.56"
            # Remove thousands separator, then replace decimal separator.
            amount_str = value_str.replace('.', '').replace(',', '.')
            amount = Decimal(amount_str)
        else:
            logger.warning(f"Amount value in row has unhandled type ({type(value)}): {row}. Skipping.")
            return None

        transaction = Transaction(
            payment_date=date_obj.date(),
            purchase_date=date_obj.date(),
            payee=description,
            splits=[TransactionSplit(amount=amount)],
            installment_number=None,
            installment_total=None
        )
        logger.debug(f"Created transaction: {transaction}")
        return transaction
    except (ValueError, InvalidOperation, IndexError) as e:
        logger.error(f"Could not parse row: {row}. Error: {e}", exc_info=True)
        return None

def _formatar_data(data, book) -> Optional[datetime]:
    try:
        if isinstance(data, float):
            return datetime(*xlrd.xldate_as_tuple(data, book.datemode))
        if isinstance(data, str) and len(data) > 0:
            try:
                return datetime.strptime(data.strip(), "%d/%m/%Y")
            except ValueError:
                return datetime.strptime(data.strip(), "%d/%m/%y")
    except (ValueError, TypeError, xlrd.xldate.XLDateError) as e:
        logger.warning(f"Could not format date '{data}'. Error: {e}")
        return None
    return None

def _ajustar_descricao(descricao: str) -> str:
    original_descricao = descricao
    if descricao.startswith(("PIX TRANSF", "PIX QRS", "PIX WHATS")):
        descricao = re.sub(r"\s*\d{2}/\d{2}$", "", descricao).strip()
        logger.debug(f"Adjusted description from '{original_descricao}' to '{descricao}'")
    return descricao.strip()

import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

import xlrd
from dateutil.relativedelta import relativedelta

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit

logger = logging.getLogger(__name__)

def extract_transactions_from_xls(file_path: str) -> List[Transaction]:
    logger.info(f"Starting to parse Itau Credit Card XLS file: {file_path}")
    transactions = []
    try:
        book = xlrd.open_workbook(file_path)
        sheet = book.sheet_by_name("Lançamentos")
        
        transactions.extend(_process_sheet(sheet, book))
        
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

    # Extract statement_identifier from the cell below "venc. da fatura"
    statement_identifier = None
    for row_idx in range(sheet.nrows - 1):
        row_values = [str(sheet.cell_value(row_idx, col_idx)).strip() for col_idx in range(sheet.ncols)]
        for col_idx, cell in enumerate(row_values):
            if cell.lower() == "venc. da fatura":
                statement_identifier = str(sheet.cell_value(row_idx + 1, col_idx)).strip()
                logger.debug(f"Found statement_identifier: {statement_identifier}")
                break
        if statement_identifier:
            break

    # Read "Atualização" date from row 1, col 1 (e.g. "04/05/2026 às 08:25:50").
    # This is the export date of the partial/open statement and tells us which billing
    # period we are in, so we can assign payment_date correctly for installment transactions.
    atualizacao_month = None  # date(YYYY, MM, 1) — first of the export month
    prev_month = None         # date(YYYY, MM, 1) — first of the month before export
    try:
        atualizacao_raw = str(sheet.cell_value(1, 1)).strip()
        # Value may be "04/05/2026 às 08:25:50" — take only the date portion
        atualizacao_date_str = atualizacao_raw.split()[0]
        atualizacao_date = datetime.strptime(atualizacao_date_str, "%d/%m/%Y").date()
        atualizacao_month = atualizacao_date.replace(day=1)
        prev_month = atualizacao_month - relativedelta(months=1)
        logger.debug(f"Atualização date: {atualizacao_date}, atualizacao_month: {atualizacao_month}, prev_month: {prev_month}")
    except Exception as e:
        logger.warning(f"Could not derive atualizacao_month from row 1 col 1: {e}")

    # Iterate through the sheet to find all transaction blocks
    header_found = False
    for row_idx in range(sheet.nrows):
        row_values = [str(sheet.cell_value(row_idx, col_idx)).strip() for col_idx in range(sheet.ncols)]

        # Check if this row is a transaction header
        if row_values[0].lower() == "data" and \
           row_values[1].lower() == "lançamento" and \
           row_values[3].lower() == "valor":
            header_found = True
            
            logger.info(f"Found main transaction header at row {row_idx}. Starting to parse transactions.")
            # Start parsing transactions from the next row
            for txn_row_idx in range(row_idx + 1, sheet.nrows):
                txn_row_values = [str(sheet.cell_value(txn_row_idx, col_idx)).strip() for col_idx in range(sheet.ncols)]
                
                # Stop condition for the current transaction block
                # If the first column is empty, or it's another header/summary line
                if not txn_row_values[0] or \
                   txn_row_values[0].lower() == "data" or \
                   "total da fatura anterior" in [cell.lower() for cell in txn_row_values] or \
                   "total nacional do cartão" in [cell.lower() for cell in txn_row_values] or \
                   "total de lançamentos" in [cell.lower() for cell in txn_row_values] or \
                   "total encargos e serviços" in [cell.lower() for cell in txn_row_values] or \
                   "total (nacionais + internacionais + encargos)" in [cell.lower() for cell in txn_row_values]:
                    logger.debug(f"Stopping transaction block parsing at row {txn_row_idx}. Row values: {txn_row_values}")
                    break # End of current transaction block

                transaction = _create_transaction_from_row(txn_row_values, book, atualizacao_month, prev_month)
                if transaction:
                    transaction.statement_identifier = statement_identifier
                    transactions.append(transaction)
                    logger.debug(f"Successfully added transaction: {transaction}")
                else:
                    logger.debug(f"Failed to create transaction from row {txn_row_idx}: {txn_row_values}. Skipping.")

    if not header_found:
        raise UnsupportedLayoutError(
            "No transaction header row found in Itaú credit card Excel — "
            "the column layout may have changed (e.g. extra column inserted)"
        )

    return transactions


def _create_transaction_from_row(row_values: List[str], book, atualizacao_month=None, prev_month=None) -> Optional[Transaction]:
    logger.debug(f"Attempting to create transaction from row: {row_values}")
    try:
        # Date (Column 0)
        date_str = row_values[0]
        date_obj = _formatar_data(date_str, book)
        if not date_obj:
            logger.warning(f"Could not parse date from row: {row_values}. Skipping.")
            return None

        # Description (Column 1)
        description = row_values[1]
        
        # Amount (Column 3)
        amount_str = row_values[3]
        if not amount_str:
            logger.warning(f"Empty amount string found in row: {row_values}. Skipping.")
            return None
        
        # Convert to Decimal, handling Brazilian format and sign convention
        # Handle Brazilian currency format: "1.234,56" -> "1234.56"
        # Or standard format: "20252.94" -> "20252.94"
        if ',' in amount_str and '.' in amount_str: # e.g., 1.234,56
            amount_clean = amount_str.replace('.', '').replace(',', '.')
        elif ',' in amount_str: # e.g., 1234,56
            amount_clean = amount_str.replace(',', '.')
        else: # e.g., 20252.94 (standard format) or 1234 (integer)
            amount_clean = amount_str
            
        amount = Decimal(amount_clean) * Decimal('-1') # Purchases are positive in Excel, but negative in TransactionSplit

        # Installment info from description
        installment_number = None
        installment_total = None
        obs = None

        installment_match = re.search(r"(\d{2})/(\d{2})$", description)
        if installment_match:
            try:
                installment_number = int(installment_match.group(1))
                installment_total = int(installment_match.group(2))
                obs = f"Parcela {installment_number:02d}/{installment_total:02d}"
                description = re.sub(r'\s*\d{2}/\d{2}$', '', description).strip() # Remove installment from description
            except ValueError:
                logger.warning(f"Could not parse installment numbers from description: {description}")

        # Clean description further (similar to itau_parser.py's _clean_description)
        payee = _clean_description(description)

        purchase_date = date_obj.date()
        # For installments > 1 the purchase happened in a prior period.
        # This is a partial/open statement, so we derive payment_date from the export
        # ("Atualização") date rather than from the due date like the PDF parser does:
        #   - purchase in a month before the export month → payment_date = first of prev month
        #   - purchase in the same month as the export     → payment_date = first of that month
        if installment_number is not None and installment_number != 1 and atualizacao_month:
            purchase_month = purchase_date.replace(day=1)
            if purchase_month < atualizacao_month:
                payment_date = prev_month
            else:
                payment_date = atualizacao_month
        else:
            payment_date = purchase_date

        transaction = Transaction(
            payment_date=payment_date,
            purchase_date=purchase_date,
            payee=payee,
            splits=[TransactionSplit(amount=amount, notes=obs)],
            installment_number=installment_number,
            installment_total=installment_total
        )
        logger.debug(f"Created transaction: {transaction}")
        return transaction
    except (ValueError, InvalidOperation, IndexError) as e:
        logger.error(f"Could not parse row: {row_values}. Error: {e}", exc_info=True)
        return None

def _formatar_data(data, book) -> Optional[datetime]:
    """
    Formats date from Excel cell value. Handles both float (Excel date) and string (DD/MM/YYYY).
    Adapted from itau_account_parser.py.
    """
    try:
        if isinstance(data, float):
            return datetime(*xlrd.xldate_as_tuple(data, book.datemode))
        if isinstance(data, str) and len(data) > 0:
            try:
                return datetime.strptime(data.strip(), "%d/%m/%Y")
            except ValueError:
                # Fallback for DD/MM/YY if needed, though plan specifies DD/MM/YYYY
                return datetime.strptime(data.strip(), "%d/%m/%y")
    except (ValueError, TypeError, xlrd.xldate.XLDateError) as e:
        logger.warning(f"Could not format date '{data}'. Error: {e}")
        return None
    return None

def _clean_description(description: str) -> str:
    """
    Cleans the transaction description. Adapted from itau_parser.py.
    """
    # Remove common suffixes or patterns that don't add value to the payee name
    # This part is already handled by the installment_match logic above
    # description = re.sub(r'\s+\d{2}/\d{2}$', '', description).strip() # Remove installment info like 01/12
    description = re.sub(r'\s+-\s+Cartão\s+final\s+\d{4}$', '', description).strip() # Remove " - Cartão final XXXX"
    return description.strip()

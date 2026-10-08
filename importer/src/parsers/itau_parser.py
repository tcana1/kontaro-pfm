import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

import pdfplumber

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit
from src.utils.date_utils import (
    determine_transaction_year,
    get_previous_first_of_month_date,
)

logger = logging.getLogger(__name__)

def extract_transactions_from_pdf(pdf_path: str, password: Optional[str] = None) -> List[Transaction]:
    transactions = []
    iof_txns = []
    data_parcelado = None
    stop_markers = [
        "L Total dos lançamentos atuais",
        "LTotaldoslançamentosatuais"#,
        #"Compras parceladas",
        #"Comprasparceladas"
    ]
    _stop_marker_pos = None  # noqa: F841

    pages_with_transactions = 0

    try:
        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                logger.debug(f"Processing page {page_num}/{len(pdf.pages)}")
                text = page.extract_text(
                        x_tolerance=1,
                        layout=True,
                        x_density=7.25,
                        y_density=13
                        ) or ""

                for line in text.splitlines():
                    # Scan for 'Emissão' line before filtering
                    if "Emissão" in line:
                        logger.debug(f"Found 'Emissão' in line: {line}")
                        pattern = r"Emissão\s?:\s?(\d{2}/\d{2}/\d{4})"
                        match = re.search(pattern, line)
                        if match:
                            next_statement_date = match.group(1)
                            data_parcelado = get_previous_first_of_month_date(next_statement_date)
                            logger.debug(f"Data Parcelado: {data_parcelado}")
                            break
                        else:
                            logger.warning("Data Parcelado not found in line")

                    if "Repasse" in line:
                        logger.debug(f"Found 'Repasse em IOF' in line: {line}")
                        pattern = r'(Repasse de IOF).*?em R\$\s*([\d.,]+)'
                        match = re.search(pattern, text)
                        if match:
                            iof_payee = match.group(1)   # "Repasse de IOF"
                            iof_amount = match.group(2)  # "13,20"
                            
                            data_iof = datetime.strptime(data_parcelado, '%d/%m/%Y').date()
                            amount_iof = iof_amount.replace('.', '').replace(',', '.').replace(' ', '')
                            amount = Decimal(amount_iof) * Decimal('-1')

                            this_iof = Transaction(
                                payment_date=data_iof,
                                purchase_date=data_iof,
                                payee=iof_payee.strip(),
                                splits=[TransactionSplit(amount=amount, notes=None)]
                            )
                            iof_txns.append(this_iof)
                            logger.debug(f"IOF transaction found: {this_iof}")

                # Skip pages that don't contain transactions
                if "lançamentos: compras e saques" not in text.lower() and "lançamentos internacionais" not in text.lower():
                    logger.debug(f"Skipping page {page_num} as it does not contain 'Lançamentos'")
                    continue
                pages_with_transactions += 1

                # Get all lines for this page
                page_lines = text.splitlines()
                
                # Check for stop markers on this page and determine position
                stop_marker_pos_on_page = None
                for line in page_lines:
                    if any(marker.lower() in line.lower() for marker in stop_markers):
                        logger.debug(f">>> Page {page_num} contains stop marker")
                        for marker in stop_markers:
                            left_pattern = rf'^\s{{0,29}}{re.escape(marker)}'
                            right_pattern = rf'^(\s{{30,}}|\s+\S.*\s+){re.escape(marker)}'
                            if re.match(left_pattern, line):
                                stop_marker_pos_on_page = "left"
                                logger.debug(f"Stop marker '{marker}' found in {stop_marker_pos_on_page} column")
                                break
                            elif re.search(right_pattern, line):
                                stop_marker_pos_on_page = "right"
                                logger.debug(f"Stop marker '{marker}' found in {stop_marker_pos_on_page} column")
                                break
                        if stop_marker_pos_on_page:
                            break

                # Process this page based on stop marker position
                if stop_marker_pos_on_page == "left":
                    # Stop marker in left column: parse only left column up to stop marker
                    logger.debug(f"Page {page_num}: Processing with stop marker in left column")
                    for line in page_lines:
                        if check_stop_marker(line, stop_markers, 'left'):
                            logger.debug(f"Page {page_num}: Reached stop marker in left column: '{line}'")
                            break
                        transaction = extract_transaction_from_line(line, 'left', data_parcelado)
                        if transaction:
                            transaction.statement_identifier = data_parcelado
                            transactions.append(transaction)
                            
                elif stop_marker_pos_on_page == "right":
                    # Stop marker in right column: parse entire left column, then right column up to stop marker
                    logger.debug(f"Page {page_num}: Processing with stop marker in right column")
                    page_transactions = parse_transactions_two_pass(page_lines, data_parcelado)
                    for tx in page_transactions:
                        tx.statement_identifier = data_parcelado
                    transactions.extend(page_transactions)
                    
                else:
                    # No stop marker found on this page: parse both columns completely
                    logger.debug(f"Page {page_num}: Processing without stop marker - parsing both columns")
                    page_transactions = parse_transactions_two_pass(page_lines, data_parcelado)
                    for tx in page_transactions:
                        tx.statement_identifier = data_parcelado
                    transactions.extend(page_transactions)

            if iof_txns:
                for tx in iof_txns:
                    tx.statement_identifier = data_parcelado
                transactions.extend(iof_txns)
                logger.debug(f"IOF transactions added: {iof_txns}")

    except Exception as e:
        logger.error(f"PDF processing failed: {str(e)}", exc_info=True)
        raise

    if pages_with_transactions == 0:
        raise UnsupportedLayoutError(
            "No 'lançamentos: compras e saques' or 'lançamentos internacionais' section found in Itaú PDF"
        )

    return transactions

def parse_transactions_two_pass(lines: List[str], data_parcelado=None) -> List[Transaction]:
    logger.info(f"Starting two-pass transaction parsing, data parcelado: {data_parcelado}")
    transactions = []
    stop_markers = [
        "L Total dos lançamentos atuais",
        "LTotaldoslançamentosatuais"#,
        #"Compras parceladas",
        #"Comprasparceladas"
    ]

    # FIRST PASS: Left column
    for line in lines:
        logger.debug(f"Processing line (left): '{line}'")
        if check_stop_marker(line, stop_markers, 'left'):
            logger.debug(f"Pass 1 - Reached stop marker in line: '{line}'")
            break
        transaction = extract_transaction_from_line(line, 'left', data_parcelado)
        if transaction:
            logger.debug(f"Parsed left transaction: {transaction}")
            transactions.append(transaction)

    # SECOND PASS: Right column
    for line in lines:
        logger.debug(f"Processing line (right): '{line}'")
        if check_stop_marker(line, stop_markers, 'right'):
            logger.debug(f"Pass 2 - Reached stop marker in line: '{line}'")
            break
        transaction = extract_transaction_from_line(line, 'right', data_parcelado)
        if transaction:
            logger.debug(f"Parsed right transaction: {transaction}")
            transactions.append(transaction)
            
    logger.info(f"Total parsed transactions: {len(transactions)}")
    return transactions

def extract_transaction_from_line(line: str, column: str, data_parcelado: Optional[str] = None) -> Optional[Transaction]:
    transaction_pattern = r'(\d{2}/\d{2})\s+(.+?)\s+(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})'
    obs = None
    
    extracted_date_str = None
    extracted_payee_str = None
    extracted_amount_str = None

    if column == 'left':
        left_pattern = rf'^\s{{0,29}}{transaction_pattern}'
        match = re.search(left_pattern, line)
        if match:
            extracted_date_str, extracted_payee_str, extracted_amount_str = match.groups()

            logger.debug(f"Left transaction match: {extracted_date_str}, {extracted_payee_str}, {extracted_amount_str}")

    elif column == 'right':
        matches = list(re.finditer(transaction_pattern, line))
        if matches:
            last_match = matches[-1] # Get the last match object
            extracted_date_str, extracted_payee_str, extracted_amount_str = last_match.groups() # Corrected

            # Check if this is actually a left match (starts in left column after only whitespace)
            text_before_match = line[:last_match.start()]
            if text_before_match.strip() == "" and last_match.start() < 30:
                logger.debug(f"Right transaction match at start of line (after whitespace), skipping: {line}")
                return None

            # Additional check: exclude matches that contain "cartão (final"
            remaining_text = line[last_match.end():]
            if "cartão (final" in remaining_text:
                logger.debug(f"Right transaction match followed by cartão pattern, skipping: {line}")
                return None

            logger.debug(f"Right transaction match: {extracted_date_str}, {extracted_payee_str}, {extracted_amount_str}")

    else:
        logger.error(f"Invalid column specified: {column}")
        return None

    # If any of the core components were not extracted, return None early
    if extracted_date_str is None or extracted_payee_str is None or extracted_amount_str is None:
        logger.debug(f"Failed to extract full transaction details from line: {line}")
        return None

    try:
        txn_year = determine_transaction_year(extracted_date_str)
        date_str_full = f"{extracted_date_str}/{txn_year}"

        # Handle installment purchases
        installment_match = re.search(r"(\d{2}/\d{2})$", extracted_payee_str)
        is_installment = False
        installment_number = None
        installment_total = None

        purchase_date_obj = datetime.strptime(date_str_full, '%d/%m/%Y').date()
        payment_date_obj = purchase_date_obj

        if installment_match and data_parcelado:
            matched_part = installment_match.group(1)
            if not matched_part.startswith("01/"):
                 payment_date_obj = datetime.strptime(data_parcelado, '%d/%m/%Y').date()
            
            is_installment = True  # noqa: F841
            try:
                num, total = matched_part.split('/')
                installment_number = int(num)
                installment_total = int(total)
                obs = f"Parcela {installment_number:02d}/{installment_total:02d}"
            except ValueError:
                logger.warning(f"Could not parse installment numbers: {matched_part}")
                obs = f"Parcela {matched_part}" # fallback to old format

            extracted_payee_str = re.sub(r'\d{2}/\d{2}$', '', extracted_payee_str).strip()

        # Robust amount cleaning and conversion: Remove all spaces
        amount_clean = extracted_amount_str.replace('.', '').replace(',', '.').replace(' ', '')
        if not amount_clean: # Handle empty string after cleaning
            logger.warning(f"Extracted amount string is empty after cleaning: '{extracted_amount_str}'")
            return None

        amount = Decimal(amount_clean) * Decimal('-1')

        return Transaction(
            payment_date=payment_date_obj,
            purchase_date=purchase_date_obj,
            payee=extracted_payee_str.strip(),
            splits=[TransactionSplit(amount=amount, notes=obs)],
            installment_number=installment_number,
            installment_total=installment_total
        )
    except (ValueError, IndexError, InvalidOperation) as e:
        logger.warning(f"Failed to parse transaction: {str(e)} from line: '{line}'. Extracted amount string: '{extracted_amount_str}'")
        return None

def check_stop_marker(line: str, stop_markers: List[str], column: str) -> bool:
    for marker in stop_markers:
        if column == 'left':
            pattern = rf'^\s{{0,29}}{re.escape(marker)}'
            if re.match(pattern, line):
                logger.debug(f"Stop marker '{marker}' found at start of line (left column)")
                return True

        elif column == 'right':
            pattern = rf'^(\s{{30,}}|\s+\S.*\s+){re.escape(marker)}'
            if re.search(pattern, line):
                logger.debug(f"Stop marker '{marker}' found in line (right column)")
                return True
    return False
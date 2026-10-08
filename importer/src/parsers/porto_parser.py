import logging
import os
import re
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

import pdfplumber
from dateutil.relativedelta import relativedelta

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit
from src.utils.date_utils import determine_transaction_year

logger = logging.getLogger(__name__)

def parse_installment_info(parcel_match):
    description = parcel_match.group(1).strip()
    installment_num_str = parcel_match.group(2)     # 01, PA
    total_installments_str = parcel_match.group(3)  # 06, 12
    logger.debug(f"Installment info to parse: '{description}', '{installment_num_str}', '{total_installments_str}'")

    installment_number = None
    installment_total = None

    if installment_num_str.isdigit() and total_installments_str.isdigit():
        installment_number = int(installment_num_str)
        installment_total = int(total_installments_str)
        notes = f"Parcela {installment_num_str}/{total_installments_str}"
    elif installment_num_str == "PA":
        notes = f"Parcela ?/{total_installments_str}"
        installment_number = int(total_installments_str)
    else:
        raise ValueError(f"Unexpected installment format: {installment_num_str}/{total_installments_str}")
    
    logger.debug(f"Parsed installment info: '{description}', '{notes}', '{installment_number}', '{installment_total}'")
    return description, notes, installment_number, installment_total

def extract_transactions(pdf_path: str, password: Optional[str] = None) -> List[Transaction]:
    transactions = []
    start_reading = False
    data_parcelado = None
    with pdfplumber.open(pdf_path, password=password) as pdf:
        # Anchor pass. Transaction lines carry only DD/MM, so their year is inferred
        # against this date instead of the import date — otherwise reprocessing an old
        # statement shifts every transaction into the current year. Resolved up front so
        # it doesn't depend on the header landing on an earlier page than the lines.
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split("\n"):
                if "previsão de fechamento da próxima fatura" in line.lower():
                    pattern = r"previsão de fechamento da próxima fatura\s+(\d{2}/\d{2}/\d{4})"
                    match = re.search(pattern, line, re.IGNORECASE)
                    if not match:
                        raise UnsupportedLayoutError(f"'previsão de fechamento' line found but date not extractable: {line.strip()}")
                    date_obj = datetime.strptime(match.group(1), "%d/%m/%Y").date()
                    data_parcelado = (date_obj.replace(day=1) - relativedelta(months=1))
                    logger.debug(f"Found next statement date: {data_parcelado.strftime('%d/%m/%Y')}")
                    break
            if data_parcelado:
                break

        if data_parcelado is None:
            raise UnsupportedLayoutError(
                "No 'previsão de fechamento da próxima fatura' header found in Porto PDF"
            )

        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            lines = text.split("\n")
            for line in lines:
                logger.debug(f"Processing line: {line.strip()}")
                if "lançamentos" in line.lower():
                    start_reading = True
                    continue
                if start_reading:
                    if "detalhamento" in line.lower():
                        start_reading = False
                        break
                    if "pagamento" in line.lower():
                        continue
                    
                    match = re.match(r"(\d{2}/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})", line)
                    if match:
                        date_str, description, amount_str = match.groups()
                        amount = Decimal(amount_str.replace('.', '').replace(',', '.').replace(' ', '')) * -1

                        notes = None
                        installment_number = None
                        installment_total = None
                        parcel_match = re.search(r"(.+?)\s+([A-Za-z0-9]{2})/([A-Za-z0-9]{2})\s*BZ", description)

                        year = determine_transaction_year(date_str, data_parcelado)
                        purchase_date = datetime.strptime(f"{date_str}/{year}", "%d/%m/%Y").date()
                        payment_date = purchase_date

                        if parcel_match:
                            description, notes, installment_number, installment_total = parse_installment_info(parcel_match)
                            if installment_number > 1 and data_parcelado:
                                payment_date = data_parcelado
                            
                        transaction = Transaction(
                            payment_date=payment_date,
                            purchase_date=purchase_date,
                            payee=description.strip(),
                            splits=[TransactionSplit(amount=amount, notes=notes)],
                            source_file=os.path.basename(pdf_path),
                            statement_identifier=data_parcelado.strftime('%d/%m/%Y'),
                            installment_number=installment_number,
                            installment_total=installment_total
                        )
                        transactions.append(transaction)

    logger.debug(f"Extracted {len(transactions)} transactions from {os.path.basename(pdf_path)}")
    return transactions

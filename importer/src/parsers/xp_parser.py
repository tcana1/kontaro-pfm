import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import List, Optional

import pdfplumber

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit

logger = logging.getLogger(__name__)

def extract_transactions(pdf_path: str, password: Optional[str] = None) -> List[Transaction]:
    logger.info(f"Starting to dump transactions from: {pdf_path}")
    transactions: List[Transaction] = []

    fatura_marker_found = False

    with pdfplumber.open(pdf_path, password=password) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            lines = text.split("\n")  # noqa: F841
            if not text:
                continue
            
            if "Resumo da sua fatura" in text:
                logger.info(f"Found 'Resumo da sua fatura' on page {page_num}")
                fatura_marker_found = True
                
                for i, line in enumerate(text.split("\n")):
                    logger.debug(f"Page {page_num}, Line {i}: {line.strip()}")

                    tnx_pattern = r"(\d{2}/\d{2}/\d{2})\s+(.+?)\s+([-]?\d{1,3}(?:\.?\d{3})*,\d{2})(?:\s+([-]?\d{1,3}(?:\.?\d{3})*,\d{2}))?"
                    match_tnx = re.match(tnx_pattern, line)
                    if match_tnx:
                        date_str, description, amount_brl_str, amount_usd_str = match_tnx.groups()
                        if "Pagamentos Validos" in description:
                            continue

                        logger.info(f"Found transaction: Date {date_str}, Payee {description}, BRL {amount_brl_str}, USD {amount_usd_str}")

                        obs = None
                        
                        # The statement prints DD/MM/YY on every line, so the year is
                        # read straight from it — no inference against the import date,
                        # which would shift an old statement on reprocessing.
                        day = int(date_str[0:2])
                        month = int(date_str[3:5])
                        year = 2000 + int(date_str[6:8])
                        purchase_date = date(year, month, day)
                        payment_date = purchase_date

                        try:
                            amount_brl = Decimal(amount_brl_str.replace('.', '').replace(',', '.')) * Decimal('-1')
                        except InvalidOperation:
                            logger.warning(f"Could not convert amount_brl_str '{amount_brl_str}' to Decimal. Skipping transaction.")
                            continue

                        if amount_usd_str:
                            try:
                                amount_usd = Decimal(amount_usd_str.replace('.', '').replace(',', '.'))
                                if amount_usd > 0:
                                    obs = f"USD $ {amount_usd}"
                            except InvalidOperation:
                                logger.warning(f"Could not convert amount_usd_str '{amount_usd_str}' to Decimal. Skipping USD notes.")

                        transactions.append(
                            Transaction(
                                payment_date=payment_date,
                                payee=description.strip(),
                                splits=[TransactionSplit(amount=amount_brl, notes=obs)],
                                installment_number=None,
                                installment_total=None,
                                purchase_date=purchase_date
                            )
                        )

    if not fatura_marker_found:
        raise UnsupportedLayoutError(
            "No 'Resumo da sua fatura' section found in XP PDF"
        )

    logger.info(f"Extracted {len(transactions)} transactions from {pdf_path}")
    return transactions
                        





                    

                
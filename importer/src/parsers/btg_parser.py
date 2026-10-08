import logging
import os
import re
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

import pdfplumber

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit
from src.utils.date_utils import determine_transaction_year

logger = logging.getLogger(__name__)

_FULL_MONTH_MAP = {
    'JANEIRO': 1, 'FEVEREIRO': 2, 'MARCO': 3, 'MARÇO': 3, 'ABRIL': 4, 'MAIO': 5, 'JUNHO': 6,
    'JULHO': 7, 'AGOSTO': 8, 'SETEMBRO': 9, 'OUTUBRO': 10, 'NOVEMBRO': 11, 'DEZEMBRO': 12
}

# Page header, e.g. "Fulano de Tal | fatura de Fevereiro de 2021 | cartão final 1234".
_STATEMENT_MONTH_RE = re.compile(r"fatura de (\w+) de (\d{4})", re.IGNORECASE)


def _find_statement_month(pdf) -> Optional[date]:
    """First of the statement's own month, used to date lines that print only DD/mon."""
    for page in pdf.pages:
        text = page.extract_text()
        if not text:
            continue
        m = _STATEMENT_MONTH_RE.search(text)
        if m:
            month = _FULL_MONTH_MAP.get(m.group(1).upper())
            if month:
                return date(int(m.group(2)), month, 1)
            logger.warning(f"Unrecognized statement month '{m.group(1)}'")
    return None


def extract_transactions(pdf_path: str, password: Optional[str] = None) -> List[Transaction]:
    logger.info(f"Starting to dump transactions from: {pdf_path}")
    transactions = []

    lancamentos_marker_found = False

    with pdfplumber.open(pdf_path, password=password) as pdf:
        start_transactions = False
        start_credits = False

        # Transaction lines carry only DD/mon, so the year comes from the statement's
        # own header rather than the import date, which would shift an old statement
        # into the current year on reprocessing.
        statement_month = _find_statement_month(pdf)
        if statement_month is None:
            logger.warning("No 'fatura de <month> de <year>' header found; falling back to today for year inference")

        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if not text:
                continue
            lines = text.split("\n")

            for i, line in enumerate(lines):
                logger.debug(f"Page {page_num}, Line {i}: {line.strip()}")

                # TODO: leave this here, we'll figure out Parcelamento later
                parcel_pattern = r"Período\s?de\s?compras:\s?(\d\d\/\d\d)\s?até\s?\d\d\/\d\d"
                parcel_match = re.search(parcel_pattern, line)
                if parcel_match:
                    parcel_date = parcel_match.group(1)
                    parcel_year = determine_transaction_year(parcel_date, statement_month)
                    installment_date = datetime.strptime(f"{parcel_date}/{parcel_year}", '%d/%m/%Y').date()
                    logger.debug(f"Found parcelamento date: {installment_date} from line: {line.strip()}")
                    break

                if "Lançamentos do cartão" not in text:
                    continue
                lancamentos_marker_found = True

                if "Total de créditos" in line:
                    start_credits = True

                elif "Total de compras e despesas" in line:
                    start_transactions = True
                    start_credits = False

                elif "Taxas e encargos" in line:
                    start_transactions = False
                    start_credits = False
                    logger.info("Found 'Taxas e encargos' header, stopping reading transactions")
                    break
                    
                if start_transactions or start_credits:
                    tnx_pattern = r"(\d{1,2}) (\w{3}) (.+?) ([A-Z$€£¥₹]+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})"
                    matches = re.findall(tnx_pattern, line)
                    for match in matches:
                        logger.info(f"Found transaction line: {line.strip()}")
                        day, month_text, description, currency, amount_str = match

                        installment_pattern = r'^(.*?)\s*\((\d{1,2})\/(\d{1,2})\)\s*$'
                        installment_match = re.match(installment_pattern, description.strip())

                        if installment_match:
                            clean_description, installment_number, installment_total = installment_match.groups()
                            installment_number = int(installment_number)
                            installment_total = int(installment_total)
                        else:
                            clean_description = description.strip()
                            installment_number = None
                            installment_total = None

                        month_map = {
                            'JAN': '01', 'FEB': '02', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
                            'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
                        }
                        month_num = month_map.get(month_text.upper(), None)
                        
                        if not month_num:
                            raise ValueError(f"Could not determine month for transaction: {line.strip()}")

                        tnx_year = determine_transaction_year(f"{day}/{month_num}", statement_month)
                        date_str = f"{day}/{month_num}/{tnx_year}"
                        purchase_date = datetime.strptime(date_str, '%d/%m/%Y').date()
                        payment_date = purchase_date

                        if installment_number and installment_number > 1:
                            payment_date = installment_date
                        
                        notes = ''
                        if currency not in ["R$", "BRL"]:
                            logger.info(f"Non-BRL currency found: {line.strip()}")

                            if i + 2 < len(lines):
                                cotacao_pattern = r'Cotação\s?da\s?moeda\s*-\s*([A-Z$€£¥₹]+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})'
                                valorbrl_pattern = r'Conversão\s?para\s?Real\s*-\s*([A-Z$€£¥₹]+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})'
                                cotacao_match = re.search(cotacao_pattern, lines[i + 1])
                                valorbrl_match = re.search(valorbrl_pattern, lines[i + 2])

                                if cotacao_match and valorbrl_match:
                                    cotacao_currency, cotacao_value = cotacao_match.groups()
                                    valorbrl_currency, valorbrl_value = valorbrl_match.groups()
                                    
                                    logger.info(f"Found conversion: '{cotacao_currency}' '{cotacao_value}' to '{valorbrl_currency}' '{valorbrl_value}'")

                                    if cotacao_currency == valorbrl_currency:
                                        notes = f"USD $ {amount_str} @ {cotacao_currency} {cotacao_value}"
                                        amount_str = valorbrl_value                                        
                                    else:
                                        logger.warning(f"Currency mismatch in conversion: {line.strip()}")
                        
                        amount = Decimal(amount_str.replace('.', '').replace(',', '.').replace(' ', ''))
                        if start_transactions:
                            amount *= -1

                        transactions.append(
                            Transaction(
                                payment_date=payment_date,
                                purchase_date=purchase_date,
                                payee=clean_description,
                                splits=[TransactionSplit(amount=amount, notes=notes)],
                                source_file=os.path.basename(pdf_path),
                                installment_number=installment_number,
                                installment_total=installment_total
                            )
                        )
                        logger.info(f"Transaction added: {transactions[-1]}")

    if not lancamentos_marker_found:
        raise UnsupportedLayoutError(
            "No 'Lançamentos do cartão' section found in BTG PDF"
        )

    return transactions

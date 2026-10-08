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

_MONTH_MAP = {
    'JAN': '01', 'FEB': '02', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06',
    'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
}

# Full-name months as printed next to "Vencimento:" (distinct from the 3-letter
# abbreviations used on transaction lines).
_FULL_MONTH_MAP = {
    'JANEIRO': 1, 'FEVEREIRO': 2, 'MARCO': 3, 'MARÇO': 3, 'ABRIL': 4, 'MAIO': 5, 'JUNHO': 6,
    'JULHO': 7, 'AGOSTO': 8, 'SETEMBRO': 9, 'OUTUBRO': 10, 'NOVEMBRO': 11, 'DEZEMBRO': 12
}

def _parse_date(day: str, month_text: str, reference_date: Optional[date] = None):
    month_num = _MONTH_MAP.get(month_text.upper())
    if not month_num:
        return None
    year = determine_transaction_year(f"{day}/{month_num}", reference_date)
    return datetime.strptime(f"{day}/{month_num}/{year}", '%d/%m/%Y').date()

def extract_transactions(pdf_path: str, password: Optional[str] = None) -> List[Transaction]:
    logger.info(f"Starting to extract transactions from: {pdf_path}")
    transactions = []
    start_reading = False
    fechamento_date = None
    vencimento_month_text = None
    with pdfplumber.open(pdf_path, password=password) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if not text:
                continue
            for line in text.split("\n"):
                if fechamento_date is None:
                    match = re.search(r"Compras e pagamentos feitos até o fechamento desta fatura em (\d{2}/\d{2}/\d{2})", line)
                    if match:
                        fechamento_date = match.group(1)
                if vencimento_month_text is None:
                    venc_match = re.search(r"[Vv]encimento:\s*\d{2}\s+de\s+(\w+)", line)
                    if venc_match:
                        vencimento_month_text = venc_match.group(1)
            if fechamento_date and vencimento_month_text:
                break

        # The fechamento→vencimento gap (5-10ish days) varies per card/holder and can
        # land in the same calendar month or the one before it, so the installment
        # payment_date below is anchored to vencimento (always ~a month ahead of the
        # "reference" competency month), not to fechamento directly.
        # Transaction lines carry only DD/mon, so the year is inferred against the
        # statement's own fechamento rather than the import date — otherwise
        # reprocessing an old statement shifts every date into the current year.
        fechamento_ref = None
        if fechamento_date:
            _, fm_text, fy_text = fechamento_date.split('/')
            fechamento_ref = date(2000 + int(fy_text), int(fm_text), 1)
        else:
            logger.warning("No fechamento date found; falling back to today for year inference")

        vencimento_date = None
        if fechamento_date and vencimento_month_text:
            _, fechamento_month, fechamento_year = fechamento_date.split('/')
            fm = int(fechamento_month)
            fy = 2000 + int(fechamento_year)
            vm = _FULL_MONTH_MAP.get(vencimento_month_text.upper())
            if vm:
                vy = fy + 1 if vm < fm else fy
                vencimento_date = date(vy, vm, 1)
            else:
                logger.warning(f"Unrecognized vencimento month '{vencimento_month_text}', falling back to fechamento-anchored payment_date")
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if not text:
                continue
            lines = text.split("\n")
            for line in lines:
                logger.debug(f"Processing line: {line.strip()}")
                if ("Transações do cartão principal" in line or "Transações dos cartões adicionais" in line):
                    start_reading = True
                    continue
                if start_reading:
                    if "Formas de pagamento" in line:
                        start_reading = False
                        break

                    paid_keywords = [
                        "PAGAMENTO EFETUADO",
                        "PAGUE COM PIX",
                        "INCLUSAO DE PAGAMENTO",
                        "PAG FATURA BOLETO"
                    ]
                    if any(keyword in line.upper() for keyword in paid_keywords):
                        continue


                    # Foreign currency: "26 jun PAYEE USD 4,63 | Cotação USD: R$5,46 25,28"
                    # The first amount is foreign (ignored), the last is BRL.
                    fx_match = re.match(
                        r"(\d{1,2}) (\w{3}) (.+?) ([A-Z]{3}) ([\d.,]+) \| Cotação [A-Z]{3}: R\$([\d.,]+) (\d{1,3}(?:\.\d{3})*,\d{2})",
                        line
                    )
                    regular_match = re.match(
                        r"(\d{1,2}) (\w{3}) (.+?) (\d{1,3}(?:\.\d{3})*,\d{2})",
                        line
                    ) if not fx_match else None

                    if not fx_match and not regular_match:
                        continue

                    installment_number = None
                    installment_total = None
                    notes = None

                    if fx_match:
                        day, month_text, description, currency, fx_amount, rate, brl_amount = fx_match.groups()
                        amount_num = Decimal(brl_amount.replace('.', '').replace(',', '.')) * -1
                        notes = f"{currency} {fx_amount.replace(',', '.')} @ R${rate}"
                        payment_date = None  # set after _parse_date below
                    else:
                        day, month_text, description, amount = regular_match.groups()
                        amount_num = Decimal(amount.replace('.', '').replace(',', '.').replace(' ', '')) * -1

                        parcel_match = re.search(r"Parcela (\d+)/(\d+)", description)
                        logger.debug(f"Parcel match: {parcel_match} for '{description}'")
                        if parcel_match:
                            installment_number = int(parcel_match.group(1))
                            installment_total = int(parcel_match.group(2))
                            notes = f"Parcela {installment_number}/{installment_total}"
                            description = description.replace(f"- {notes}", "").strip()
                            logger.debug(f"Found installment info: {notes}")

                        payment_date = None  # set after _parse_date below

                    if description.lower().endswith("estorno"):
                        amount_num *= -1

                    purchase_date = _parse_date(day, month_text, fechamento_ref)
                    if not purchase_date:
                        continue
                    payment_date = purchase_date

                    if not fx_match and installment_number and installment_number > 1:
                        anchor = vencimento_date
                        if anchor is None and fechamento_date:
                            # Fallback for statements where the vencimento line wasn't found.
                            _, fechamento_month, fechamento_year = fechamento_date.split('/')
                            anchor = date(2000 + int(fechamento_year), int(fechamento_month), 1)
                        if anchor:
                            if anchor.month == 1:
                                prev_month, prev_year = 12, anchor.year - 1
                            else:
                                prev_month, prev_year = anchor.month - 1, anchor.year
                            payment_date = date(prev_year, prev_month, 1)
                            logger.debug(
                                f"Adjusted payment_date for installment {installment_number} to first of {prev_month:02d}/{prev_year}"
                            )

                    transactions.append(Transaction(
                        payment_date=payment_date,
                        purchase_date=purchase_date,
                        payee=description.strip(),
                        splits=[TransactionSplit(amount=amount_num, notes=notes)],
                        source_file=os.path.basename(pdf_path),
                        statement_identifier=fechamento_date,
                        installment_number=installment_number,
                        installment_total=installment_total,
                    ))
    if fechamento_date is None:
        raise UnsupportedLayoutError(
            "No 'fechamento desta fatura em DD/MM/YY' header found in C6 PDF"
        )

    logger.info(f"Extracted {len(transactions)} transactions")
    return transactions

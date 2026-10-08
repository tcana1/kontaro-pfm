"""Parser for C6 Conta Global EUR statements (bank account extract in Euro).

Uses pdfplumber's extract_table() to correctly handle multi-line description cells.
Converts EUR amounts to BRL using historical rates from Open Exchange Rates API.
Set OPENEXCHANGERATES_APP_ID in the environment to enable conversion.

Without a key, amounts are imported in EUR as-is — i.e. a EUR figure in a BRL column,
which understates every total that includes it. The import still succeeds (by design);
only a per-transaction rate miss causes that row to be skipped.
"""

import json
import logging
import os
import re
import urllib.request
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import List, Optional

import pdfplumber

from src.exceptions import UnsupportedLayoutError
from src.processing.transaction_model import Transaction, TransactionSplit

logger = logging.getLogger(__name__)

MONTH_PT = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
    'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
}

# Transaction types to skip (pending — will settle in a future statement)
SKIP_TIPOS = {"em processamento"}

OXR_URL = (
    "https://openexchangerates.org/api/historical/{date}.json"
    "?app_id={app_id}&symbols=EUR,BRL"
)


# ── Period parsing ─────────────────────────────────────────────────────────────

_PERIOD_RE = re.compile(
    r"Extrato Per[ií]odo\s*[•·]\s*(\d{1,2}) de (\w+) de (\d{4})"
    r" até (\d{1,2}) de (\w+) de (\d{4})",
    re.IGNORECASE,
)

# The period comes straight from the PDF and drives one OXR request per day in
# _fetch_eur_brl_rates, inside a thread that the route's timeout cannot cancel. A file
# claiming "1 de janeiro de 1000 até 31 de dezembro de 9999" would queue millions of
# sequential HTTP calls and wedge the worker pool. Real statements cover a month.
MAX_PERIOD_DAYS = 400
MAX_PERIOD_YEARS_FROM_TODAY = 5


def _validate_period(start: date, end: date) -> None:
    if end < start:
        raise UnsupportedLayoutError(f"Statement period ends before it starts ({start} → {end})")
    span = (end - start).days
    if span > MAX_PERIOD_DAYS:
        raise UnsupportedLayoutError(
            f"Statement period spans {span} days, over the {MAX_PERIOD_DAYS}-day limit ({start} → {end})"
        )
    this_year = date.today().year
    for d in (start, end):
        if abs(d.year - this_year) > MAX_PERIOD_YEARS_FROM_TODAY:
            raise UnsupportedLayoutError(f"Statement period date {d} is implausibly far from today")


def _parse_period(pdf_path: str, password: Optional[str]) -> tuple[date, date]:
    with pdfplumber.open(pdf_path, password=password) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            m = _PERIOD_RE.search(text)
            if m:
                d1, mn1, y1, d2, mn2, y2 = m.groups()
                start = date(int(y1), MONTH_PT[mn1.lower()], int(d1))
                end   = date(int(y2), MONTH_PT[mn2.lower()], int(d2))
                _validate_period(start, end)
                logger.info(f"Statement period: {start} → {end}")
                return start, end
    raise UnsupportedLayoutError("Could not find statement period header in PDF (expected 'Extrato Período … até …')")


def _build_month_year_map(start: date, end: date) -> dict[int, int]:
    """Map each month number that appears in the period to its year."""
    mapping: dict[int, int] = {}
    cur = date(start.year, start.month, 1)
    end_m = date(end.year, end.month, 1)
    while cur <= end_m:
        mapping[cur.month] = cur.year
        cur = date(cur.year + (cur.month == 12), (cur.month % 12) + 1, 1)
    return mapping


# ── Exchange rate fetching ─────────────────────────────────────────────────────

def _fetch_eur_brl_rates(start: date, end: date, app_id: str) -> dict[date, Decimal]:
    rates: dict[date, Decimal] = {}
    cur = start
    while cur <= end:
        url = OXR_URL.format(date=cur.isoformat(), app_id=app_id)
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read())
            eur = Decimal(str(data["rates"]["EUR"]))
            brl = Decimal(str(data["rates"]["BRL"]))
            rates[cur] = (brl / eur).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            logger.debug(f"  {cur}: 1 EUR = BRL {rates[cur]}")
        except Exception as exc:
            logger.warning(f"Could not fetch rate for {cur}: {exc}")
        cur += timedelta(days=1)
    logger.info(f"Fetched {len(rates)} EUR/BRL rates")
    return rates


def _get_rate(rates: dict[date, Decimal], target: date) -> Optional[Decimal]:
    """Return rate for target, falling back up to 7 days prior (covers weekends/holidays)."""
    for i in range(7):
        d = target - timedelta(days=i)
        if d in rates:
            if i:
                logger.debug(f"Rate for {target}: using {d} (fallback -{i}d)")
            return rates[d]
    logger.warning(f"No EUR/BRL rate found within 7 days of {target}")
    return None


# ── Amount / date helpers ──────────────────────────────────────────────────────

def _parse_amount(raw: str) -> Optional[Decimal]:
    """Parse '-€ 2.655,36' or '€ 8,50' → Decimal."""
    if not raw:
        return None
    # Remove euro sign and all whitespace (including non-breaking space)
    cleaned = re.sub(r"[€\s\xa0]", "", raw)
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return Decimal(cleaned)
    except Exception:
        logger.warning(f"Could not parse amount: {raw!r}")
        return None


_DDMM_RE = re.compile(r"^(\d{2})/(\d{2})$")


def _table_settings(page) -> dict:
    """Return extract_tables settings that capture first/last rows near page boundaries."""
    words = page.extract_words()
    explicit_lines = []

    auth_words = [w for w in words if w["text"] == "Autorização"]
    if auth_words:
        header_bottom = max(w["bottom"] for w in auth_words)
        date_words_below = [w for w in words if _DDMM_RE.match(w["text"]) and w["top"] > header_bottom]
        if date_words_below:
            first_top = min(w["top"] for w in date_words_below)
            explicit_lines.append((header_bottom + first_top) / 2)

    all_date_words = [w for w in words if _DDMM_RE.match(w["text"])]
    if all_date_words:
        last_bottom = max(w["bottom"] for w in all_date_words)
        explicit_lines.append(last_bottom + 2)

    return {"explicit_horizontal_lines": explicit_lines} if explicit_lines else {}

def _parse_date(dd_mm: str, month_year_map: dict[int, int]) -> Optional[date]:
    m = _DDMM_RE.match(dd_mm.strip())
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    year = month_year_map.get(month)
    if year is None:
        return None
    return date(year, month, day)


# ── Main extractor ─────────────────────────────────────────────────────────────

def extract_transactions(pdf_path: str, password: Optional[str] = None) -> List[Transaction]:
    logger.info(f"C6 Global EUR: extracting from {pdf_path}")

    start_date, end_date = _parse_period(pdf_path, password)
    month_year_map = _build_month_year_map(start_date, end_date)
    statement_identifier = end_date.strftime("%d/%m/%Y")

    # Try user-specific key from DB, fall back to operator env var
    try:
        from src.database import db_handler as _db
        app_id = _db.get_openexchange_key() or os.getenv("OPENEXCHANGERATES_APP_ID")
    except Exception:
        app_id = os.getenv("OPENEXCHANGERATES_APP_ID")
    rates: dict[date, Decimal] = {}
    if app_id:
        fetch_from = start_date - timedelta(days=7)
        rates = _fetch_eur_brl_rates(fetch_from, end_date, app_id)
    else:
        # Deliberate: the import proceeds instead of failing. The amounts land in a BRL
        # column still denominated in EUR, so every total that includes them is wrong
        # until the rows are fixed by hand. Configure the key to avoid this.
        logger.warning(
            "OPENEXCHANGERATES_APP_ID not set — amounts will be stored as EUR figures in a "
            "BRL column, understating every total that includes them. Set an Open Exchange "
            "Rates key (Settings, or the env var) and re-import to get converted values."
        )

    transactions: List[Transaction] = []

    last_payment_date: Optional[date] = None

    with pdfplumber.open(pdf_path, password=password) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables(table_settings=_table_settings(page))
            if not tables:
                logger.debug(f"Page {page_num}: no tables found")
                continue

            for table in tables:
                valid_rows = [r for r in table if r and len(r) >= 4]
                for idx, row in enumerate(valid_rows):
                    date_cell   = (row[0] or "").strip()
                    tipo_cell   = (row[1] or "").strip()
                    desc_cell   = (row[2] or "").strip()
                    amount_cell = (row[3] or "").strip()
                    auth_cell   = ((row[4] or "").strip()) if len(row) > 4 else ""

                    # When pdfplumber splits a multi-line cell into a phantom row,
                    # the date and auth columns end up empty. Peek at the next row
                    # to recover them.
                    if not date_cell and not auth_cell and amount_cell:
                        for next_row in valid_rows[idx + 1 : idx + 3]:
                            nd = (next_row[0] or "").strip()
                            na = ((next_row[4] or "").strip()) if len(next_row) > 4 else ""
                            if _DDMM_RE.match(nd):
                                date_cell = nd
                                if _DDMM_RE.match(na):
                                    auth_cell = na
                                break

                    # Skip non-transaction rows (headers, section titles, footers)
                    if date_cell and not _DDMM_RE.match(date_cell):
                        continue

                    # Track last seen date even for skipped rows
                    if date_cell and _DDMM_RE.match(date_cell):
                        parsed = _parse_date(date_cell, month_year_map)
                        if parsed:
                            last_payment_date = parsed

                    if tipo_cell.lower() in SKIP_TIPOS:
                        continue
                    if not amount_cell or "€" not in amount_cell:
                        continue

                    if date_cell and _DDMM_RE.match(date_cell):
                        payment_date = _parse_date(date_cell, month_year_map)
                        if payment_date is None:
                            logger.warning(f"Could not parse payment date: {date_cell!r}")
                            continue
                        last_payment_date = payment_date
                    elif last_payment_date:
                        payment_date = last_payment_date
                    else:
                        logger.warning(f"No date available for row: {row}")
                        continue

                    purchase_date = payment_date
                    if auth_cell:
                        parsed_auth = _parse_date(auth_cell, month_year_map)
                        if parsed_auth:
                            purchase_date = parsed_auth
                            payment_date = parsed_auth

                    eur_amount = _parse_amount(amount_cell)
                    if eur_amount is None:
                        continue

                    # Clean up description (pdfplumber may include newlines in cell)
                    payee = " ".join(desc_cell.split()).split("\\")[0].strip()

                    if rates:
                        rate = _get_rate(rates, purchase_date)
                        if rate:
                            brl_amount = (eur_amount * rate).quantize(
                                Decimal("0.01"), rounding=ROUND_HALF_UP
                            )
                            notes = f"EUR {eur_amount} @ {rate}"
                        else:
                            # Rate lookup failed despite API key being set. Skipping to avoid
                            # storing a EUR amount in a BRL field (silent data corruption).
                            logger.error(
                                f"Skipping transaction '{payee}' {eur_amount}: "
                                f"no EUR/BRL rate within 7 days of {purchase_date}"
                            )
                            continue
                    else:
                        brl_amount = eur_amount
                        notes = f"EUR {eur_amount}"

                    transactions.append(Transaction(
                        payment_date=payment_date,
                        purchase_date=purchase_date,
                        payee=payee,
                        splits=[TransactionSplit(amount=brl_amount, notes=notes)],
                        source_file=os.path.basename(pdf_path),
                        statement_identifier=statement_identifier,
                    ))
                    logger.debug(f"  {payment_date} {repr(payee[:40])} {brl_amount}")

    logger.info(f"Extracted {len(transactions)} transactions")
    return transactions

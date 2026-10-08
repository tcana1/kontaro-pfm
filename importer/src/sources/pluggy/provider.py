"""Pluggy REST API provider."""

import json
import logging
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from .base import BaseProvider, PfmTransaction

logger = logging.getLogger(__name__)

PLUGGY_API_BASE = "https://api.pluggy.ai"

# Category ID that represents invoice payment — must be ignored (comes from checking account)
INVOICE_PAYMENT_CATEGORY = "05100000"

# "Automatic investment" (APL/RES APLIC AUT MAIS sweeps) — internal moves between
# checking and the auto-invest balance, not spending or income. Bank accounts only.
AUTO_INVESTMENT_CATEGORY = "03010000"

# Cap on pages per fetch — guards against a pagination loop if the API ever
# keeps returning `next` with (near-)empty results.
MAX_FETCH_PAGES = 200


def _get_api_key(client_id: str, client_secret: str) -> str:
    """Authenticates with Pluggy and returns a fresh API key (valid 2h)."""
    payload = json.dumps({"clientId": client_id, "clientSecret": client_secret}).encode()
    req = urllib.request.Request(
        f"{PLUGGY_API_BASE}/auth",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())["apiKey"]


def _pluggy_get(path: str, api_key: str) -> dict:
    url = f"{PLUGGY_API_BASE}{path}"
    req = urllib.request.Request(url, headers={"X-API-KEY": api_key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_bills(account_id: str, api_key: str) -> list[dict]:
    data = _pluggy_get(f"/bills?accountId={account_id}", api_key)
    return data.get("results", [])  # /bills still on v1


def fetch_transactions_page(
    account_id: str,
    api_key: str,
    date_from: date | None = None,
    created_at_from: datetime | None = None,
) -> list[dict]:
    """Fetch transactions for an account via v2 cursor pagination, filtered server-side.

    date_from filters on the transaction `date`; created_at_from filters on when Pluggy
    created the record (catches backdated entries). The two filters cannot be combined.
    """
    if date_from and created_at_from:
        raise ValueError("date_from and created_at_from cannot be combined")
    path = f"/v2/transactions?accountId={account_id}"
    if date_from:
        path += f"&dateFrom={date_from.isoformat()}"
    if created_at_from:
        created = created_at_from.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        path += f"&createdAtFrom={created}"
    txs: list[dict] = []
    pages = 0
    while True:
        pages += 1
        if pages > MAX_FETCH_PAGES:
            print(
                f"  WARNING: fetch_transactions_page stopped after {MAX_FETCH_PAGES} pages "
                "(possible pagination loop)",
                file=sys.stderr,
            )
            break
        data = _pluggy_get(path, api_key)
        page = data.get("results", [])
        txs.extend(page)
        next_qs = data.get("next")  # e.g. "?accountId=...&after=..."
        # Guard against a degenerate `next` with no results (no progress, no exit)
        if not next_qs or not page:
            break
        path = f"/v2/transactions{next_qs}"
    return txs


def should_import(tx: dict) -> bool:
    """Return False for transactions that should never reach the PFM.

    Only applies to credit-card statements: the invoice-payment line there
    (categoryId 05100000 / "Pagamento recebido") just mirrors money that
    already left the checking account, so importing it on the card side
    would double count. On the checking account the same categoryId is a
    real cash outflow and must be kept — see fetch_transactions, which only
    calls this for account_type != "bank".
    """
    if tx.get("categoryId") == INVOICE_PAYMENT_CATEGORY:
        return False
    # Fallback: description-based guard in case categoryId changes
    if tx.get("description", "").strip().lower() == "pagamento recebido":
        return False
    return True


def _parse_date(s: str | None, tz: str | None = None) -> date | None:
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        dt = dt.astimezone(_resolve_tz(tz))
    return dt.date()


def _resolve_tz(tz: str | None) -> ZoneInfo:
    """Timezone chain: connector's configured timezone, falling back to America/Sao_Paulo."""
    return ZoneInfo(tz or "America/Sao_Paulo")


def _fix_encoding(s: str) -> str:
    """Fix double-encoded UTF-8 strings sent by Pluggy as Latin-1 (e.g. 'Âº' → 'º')."""
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


def _clean_payee(description: str, installment_number: int | None) -> str:
    """Strip trailing installment notation (e.g. '01/12') for installment transactions."""
    description = _fix_encoding(description)
    if installment_number is not None:
        return re.sub(r'\s*\d{2}/\d{2}$', '', description).rstrip()
    return description


def _strip_prefix_ci(name: str, prefix: str) -> str | None:
    """Case-insensitive prefix strip. Returns remainder if matched, None otherwise."""
    if name.lower().startswith(prefix.lower()):
        return name[len(prefix):]
    return None


_PREFIX_REPLACEMENTS = [
    # Check longer ones first
    ("Pix enviado por Whatsapp ", "PIX WHATSAPP "),
    ("Pagamento de Pix QR Code ", "PIX QRCODE "),
    ("Pix enviado ", "PIX "),
    ("Pix agendado ", "PIX "),
]

# Received PIX — strip prefix and uppercase remainder
_PREFIX_RECEIVED = ("Pix recebido ", "PIX RECEBIDO ")

# Prefixes that are just stripped
_PREFIX_STRIP = (
    "Débito automático ",
    "Rendimentos ",
    "RENDIMENTOS ",
    "Resgate ",          # "Resgate RESGATE CDB" → "RESGATE CDB"
    "Pagamento de boleto ",
    "Compra débito ",
    "RECEBIMENTOS ",
    "Aplicação ",        # "Aplicação APL ..." → "APL ..."
    "Saída ",            # "Saída PAGAMENTO TRIBUTO DARE ..." → "PAGAMENTO TRIBUTO DARE ..."
)


def _clean_bank_payee(description: str, tx_type: str) -> str:
    description = _fix_encoding(description)
    is_credit = tx_type == "CREDIT"
    result = description

    for prefix, replacement in _PREFIX_REPLACEMENTS:
        rest = _strip_prefix_ci(description, prefix)
        if rest is not None:
            result = replacement + rest
            break
    else:
        for prefix in _PREFIX_RECEIVED:
            rest = _strip_prefix_ci(description, prefix)
            if rest is not None:
                result = "PIX " + rest.upper()
                break
        else:
            for prefix in _PREFIX_STRIP:
                rest = _strip_prefix_ci(description, prefix)
                if rest is not None:
                    result = rest
                    break
            else:
                # "Entrada" only stripped for credits
                if is_credit:
                    rest = _strip_prefix_ci(description, "Entrada ")
                    if rest is not None:
                        result = rest

    # Strip trailing DD/MM date suffix added by some banks (e.g. "ACME LTDA02/09")
    return re.sub(r'\s*\d{2}/\d{2}$', '', result)


def _amount_in_brl(tx: dict) -> Decimal:
    """Pluggy's `amount` is in the transaction's own currency; foreign-currency
    transactions carry the BRL value in `amountInAccountCurrency`."""
    currency = tx.get("currencyCode")
    if currency and currency != "BRL":
        converted = tx.get("amountInAccountCurrency")
        if converted is None:
            raise ValueError(f"Pluggy tx {tx.get('id')} is in {currency} without amountInAccountCurrency")
        return Decimal(str(converted))
    return Decimal(str(tx["amount"]))


def to_pfm_transaction_bank(tx: dict, tz: str | None = None) -> PfmTransaction:
    """Map a Pluggy BANK account transaction to a PfmTransaction."""
    payment_date = _parse_date(tx["date"], tz)
    amount_raw = _amount_in_brl(tx)
    amount = abs(amount_raw) if tx.get("type") == "CREDIT" else -abs(amount_raw)
    return PfmTransaction(
        payment_date=payment_date,
        purchase_date=payment_date,
        payee=_clean_bank_payee(tx.get("description", ""), tx.get("type", "")),
        amount=amount,
        status_id=1,
        statement_identifier=f"pluggy:{tx['id']}",
    )


def _payment_date_for_credit(tx_date: date, meta: dict) -> date:
    """For CREDIT transactions, Pluggy sets date=purchase_date for installment
    roundings even when they land on a later bill. Use billForecastDate to
    correct the month when the two disagree."""
    forecast = meta.get("billForecastDate")  # "YYYY-MM" or None
    if not forecast:
        return tx_date
    try:
        fy, fm = int(forecast[:4]), int(forecast[5:7])
    except (ValueError, IndexError):
        return tx_date
    if (tx_date.year, tx_date.month) != (fy, fm):
        return date(fy, fm, 1)
    return tx_date


def to_pfm_transaction(tx: dict, tz: str | None = None) -> PfmTransaction:
    """Map a Pluggy transaction dict to a PfmTransaction."""
    meta = tx.get("creditCardMetadata") or {}
    tx_date = _parse_date(tx["date"], tz)

    if tx.get("type") == "CREDIT":
        payment_date = _payment_date_for_credit(tx_date, meta)
    else:
        payment_date = tx_date

    purchase_date = _parse_date(meta.get("purchaseDate"), tz) or payment_date

    # Caller filters both tx["date"] and the final payment_date against today.

    # Amount sign: CREDIT = positive (refund/cashback), DEBIT = negative (expense)
    amount_raw = _amount_in_brl(tx)
    amount = abs(amount_raw) if tx.get("type") == "CREDIT" else -abs(amount_raw)

    statement_identifier = f"pluggy:{tx['id']}"

    installment_number: Optional[int] = meta.get("installmentNumber")
    installment_total: Optional[int] = meta.get("totalInstallments")

    payee = _clean_payee(tx.get("description", ""), installment_number)

    return PfmTransaction(
        payment_date=payment_date,
        purchase_date=purchase_date,
        payee=payee,
        amount=amount,
        status_id=1,
        statement_identifier=statement_identifier,
        installment_number=installment_number,
        installment_total=installment_total,
    )


class PluggyProvider(BaseProvider):
    def __init__(self, client_id: str, client_secret: str, tz: str | None = None):
        self._tz = tz
        self._api_key = _get_api_key(client_id, client_secret)

    def get_api_key(self) -> str:
        return self._api_key

    def fetch_bills_for_account(self, account_id: str) -> list[dict]:
        return fetch_bills(account_id, self._api_key)

    def fetch_transactions(
        self,
        account_id: str,
        date_from: date | None = None,
        account_type: str = "credit_card",
        created_at_from: datetime | None = None,
    ) -> list[PfmTransaction]:
        # Cap at yesterday: the current day is still settling at the source, so
        # its orders can shift or disappear on the next sync. Only import days
        # that are done changing.
        upper = date.today() - timedelta(days=1)
        raw = fetch_transactions_page(
            account_id, self._api_key, date_from=date_from, created_at_from=created_at_from
        )
        result = []
        for tx in raw:
            tx_date = _parse_date(tx.get("date"), self._tz)
            if tx_date and tx_date > upper:
                continue
            if account_type != "bank" and not should_import(tx):
                continue
            if account_type == "bank" and tx.get("categoryId") == AUTO_INVESTMENT_CATEGORY:
                continue
            try:
                if account_type == "bank":
                    pfm_tx = to_pfm_transaction_bank(tx, tz=self._tz)
                else:
                    pfm_tx = to_pfm_transaction(tx, tz=self._tz)
            except ValueError as e:
                logger.warning("Skipping transaction: %s", e)
                continue
            if pfm_tx.payment_date > upper:
                continue
            result.append(pfm_tx)
        return result

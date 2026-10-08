"""Unit tests for Pluggy provider pure functions — no network calls."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from src.sources.pluggy.base import PfmTransaction
from src.sources.pluggy.provider import (
    AUTO_INVESTMENT_CATEGORY,
    INVOICE_PAYMENT_CATEGORY,
    PluggyProvider,
    _clean_bank_payee,
    _clean_payee,
    _fix_encoding,
    _parse_date,
    _payment_date_for_credit,
    _strip_prefix_ci,
    fetch_transactions_page,
    should_import,
    to_pfm_transaction,
    to_pfm_transaction_bank,
)

# ── _parse_date ───────────────────────────────────────────────────────────────

class TestParseDate:
    def test_none_returns_none(self):
        assert _parse_date(None) is None

    def test_empty_string_returns_none(self):
        assert _parse_date("") is None

    def test_iso_date_string(self):
        assert _parse_date("2026-09-08") == date(2026, 9, 8)

    def test_iso_datetime_string_truncated(self):
        assert _parse_date("2026-09-08T10:30:00Z") == date(2026, 9, 8)

    def test_iso_datetime_with_offset(self):
        assert _parse_date("2026-01-15T00:00:00-03:00") == date(2026, 1, 15)

    def test_utc_midnight_before_brt_rolls_back(self):
        # 02:00Z on Jan 1 is 23:00 on Dec 31 in America/Sao_Paulo (UTC-3)
        assert _parse_date("2026-01-01T02:00:00Z") == date(2025, 12, 31)

    def test_explicit_tz_overrides_default(self):
        assert _parse_date("2026-01-01T02:00:00Z", tz="UTC") == date(2026, 1, 1)


# ── _fix_encoding ─────────────────────────────────────────────────────────────

class TestFixEncoding:
    def test_clean_ascii_unchanged(self):
        assert _fix_encoding("Hello World") == "Hello World"

    def test_double_encoded_ordinal_symbol(self):
        # "Âº" is "º" (U+00BA) double-encoded as Latin-1 bytes
        assert _fix_encoding("Âº") == "º"

    def test_non_latin1_encodable_returns_original(self):
        # Emoji cannot be encoded as latin-1 → returned as-is
        assert _fix_encoding("emoji 🎉") == "emoji 🎉"


# ── _strip_prefix_ci ──────────────────────────────────────────────────────────

class TestStripPrefixCi:
    def test_exact_case_match(self):
        assert _strip_prefix_ci("Pix enviado João", "Pix enviado ") == "João"

    def test_case_insensitive_match(self):
        assert _strip_prefix_ci("PIX ENVIADO João", "Pix enviado ") == "João"

    def test_no_match_returns_none(self):
        assert _strip_prefix_ci("Outro texto", "Pix enviado ") is None

    def test_empty_remainder(self):
        assert _strip_prefix_ci("Pix enviado ", "Pix enviado ") == ""


# ── _clean_payee ──────────────────────────────────────────────────────────────

class TestCleanPayee:
    def test_no_installment_unchanged(self):
        assert _clean_payee("Amazon Prime", None) == "Amazon Prime"

    def test_installment_strips_trailing_notation(self):
        assert _clean_payee("Netflix 01/12", 1) == "Netflix"

    def test_installment_no_trailing_notation_unchanged(self):
        assert _clean_payee("Netflix", 3) == "Netflix"

    def test_no_installment_date_like_suffix_kept(self):
        # Without installment_number the regex is not applied
        assert _clean_payee("Loja 01/12", None) == "Loja 01/12"

    def test_fixes_encoding(self):
        result = _clean_payee("CrÃ©dito Âº parcela", None)
        assert "º" in result or "é" in result


# ── _clean_bank_payee ─────────────────────────────────────────────────────────

class TestCleanBankPayee:
    def test_pix_whatsapp_prefix_replaced(self):
        assert _clean_bank_payee("Pix enviado por Whatsapp João", "DEBIT") == "PIX WHATSAPP João"

    def test_pix_qrcode_prefix_replaced(self):
        assert _clean_bank_payee("Pagamento de Pix QR Code Loja", "DEBIT") == "PIX QRCODE Loja"

    def test_pix_enviado_prefix_replaced(self):
        assert _clean_bank_payee("Pix enviado Empresa", "DEBIT") == "PIX Empresa"

    def test_pix_agendado_prefix_replaced(self):
        assert _clean_bank_payee("Pix agendado Empresa", "DEBIT") == "PIX Empresa"

    def test_pix_recebido_uppercased(self):
        assert _clean_bank_payee("Pix recebido maria silva", "CREDIT") == "PIX MARIA SILVA"

    def test_pix_recebido_uppercase_variant(self):
        assert _clean_bank_payee("PIX RECEBIDO João", "CREDIT") == "PIX JOÃO"

    def test_debito_automatico_stripped(self):
        assert _clean_bank_payee("Débito automático Netflix", "DEBIT") == "Netflix"

    def test_rendimentos_stripped(self):
        assert _clean_bank_payee("Rendimentos CDB", "CREDIT") == "CDB"

    def test_rendimentos_uppercase_stripped(self):
        assert _clean_bank_payee("RENDIMENTOS CDB", "CREDIT") == "CDB"

    def test_resgate_stripped(self):
        assert _clean_bank_payee("Resgate RESGATE CDB", "DEBIT") == "RESGATE CDB"

    def test_pagamento_boleto_stripped(self):
        assert _clean_bank_payee("Pagamento de boleto Empresa X", "DEBIT") == "Empresa X"

    def test_compra_debito_stripped(self):
        assert _clean_bank_payee("Compra débito Mercado", "DEBIT") == "Mercado"

    def test_recebimentos_stripped(self):
        assert _clean_bank_payee("RECEBIMENTOS Salário", "CREDIT") == "Salário"

    def test_entrada_stripped_for_credit(self):
        assert _clean_bank_payee("Entrada Salário", "CREDIT") == "Salário"

    def test_entrada_not_stripped_for_debit(self):
        assert _clean_bank_payee("Entrada Salário", "DEBIT") == "Entrada Salário"

    def test_trailing_date_stripped(self):
        assert _clean_bank_payee("ACME LTDA02/09", "DEBIT") == "ACME LTDA"

    def test_unknown_prefix_returned_as_is(self):
        assert _clean_bank_payee("Compra internacional Store", "DEBIT") == "Compra internacional Store"

    def test_longer_prefix_wins_over_shorter(self):
        # "Pix enviado por Whatsapp" must match before "Pix enviado"
        result = _clean_bank_payee("Pix enviado por Whatsapp Fulano", "DEBIT")
        assert result.startswith("PIX WHATSAPP")


# ── _payment_date_for_credit ──────────────────────────────────────────────────

class TestPaymentDateForCredit:
    def test_no_forecast_returns_tx_date(self):
        d = date(2026, 9, 8)
        assert _payment_date_for_credit(d, {}) == d

    def test_forecast_same_month_returns_tx_date(self):
        d = date(2026, 9, 8)
        assert _payment_date_for_credit(d, {"billForecastDate": "2026-09"}) == d

    def test_forecast_different_month_returns_first_of_forecast(self):
        d = date(2026, 9, 8)
        result = _payment_date_for_credit(d, {"billForecastDate": "2026-10"})
        assert result == date(2026, 10, 1)

    def test_invalid_forecast_returns_tx_date(self):
        d = date(2026, 9, 8)
        assert _payment_date_for_credit(d, {"billForecastDate": "invalid"}) == d

    def test_none_forecast_returns_tx_date(self):
        d = date(2026, 9, 8)
        assert _payment_date_for_credit(d, {"billForecastDate": None}) == d


# ── should_import ─────────────────────────────────────────────────────────────

class TestShouldImport:
    def test_invoice_payment_category_excluded(self):
        tx = {"categoryId": INVOICE_PAYMENT_CATEGORY, "description": "anything"}
        assert should_import(tx) is False

    def test_pagamento_recebido_excluded(self):
        tx = {"categoryId": "other", "description": "pagamento recebido"}
        assert should_import(tx) is False

    def test_pagamento_recebido_case_insensitive_with_spaces(self):
        tx = {"categoryId": "other", "description": "  Pagamento Recebido  "}
        assert should_import(tx) is False

    def test_normal_transaction_included(self):
        tx = {"categoryId": "01000000", "description": "Compra Amazon"}
        assert should_import(tx) is True

    def test_no_category_id_included(self):
        tx = {"description": "Compra normal"}
        assert should_import(tx) is True


# ── fetch_transactions_page ───────────────────────────────────────────────────

class TestFetchTransactionsPage:
    def test_empty_results_with_next_terminates(self):
        # Degenerate page: `next` present but no results — must not loop forever
        with patch(
            "src.sources.pluggy.provider._pluggy_get",
            return_value={"results": [], "next": "?accountId=x&after=1"},
        ) as mock_get:
            txs = fetch_transactions_page("acct-uuid", "key", date_from=date(2026, 9, 1))

        assert txs == []
        assert mock_get.call_count == 1

    def test_page_cap_breaks_loop(self):
        def page_resp(*args, **kwargs):
            return {
                "results": [{"id": str(i), "date": "2026-09-08T03:00:00.000Z"} for i in range(500)],
                "next": "?accountId=acct-uuid&after=x",
            }

        with patch("src.sources.pluggy.provider._pluggy_get", side_effect=page_resp) as mock_get:
            txs = fetch_transactions_page("acct-uuid", "key", date_from=date(2026, 9, 1))

        assert mock_get.call_count == 200  # cap trips before the 201st fetch
        assert len(txs) == 200 * 500

    def test_follows_next_until_exhausted_without_client_side_trim(self):
        pages = [
            {"results": [{"id": "1", "date": "2026-09-08T03:00:00.000Z"}], "next": "?accountId=a&dateFrom=2026-09-01&after=B"},
            {"results": [{"id": "2", "date": "2026-08-20T03:00:00.000Z"}], "next": None},
        ]
        with patch("src.sources.pluggy.provider._pluggy_get", side_effect=pages) as mock_get:
            txs = fetch_transactions_page("a", "key", date_from=date(2026, 9, 1))

        assert [t["id"] for t in txs] == ["1", "2"]
        assert mock_get.call_args_list[0].args[0] == "/v2/transactions?accountId=a&dateFrom=2026-09-01"
        assert mock_get.call_args_list[1].args[0] == "/v2/transactions?accountId=a&dateFrom=2026-09-01&after=B"

    def test_date_from_param(self):
        with patch("src.sources.pluggy.provider._pluggy_get", return_value={"results": []}) as mock_get:
            fetch_transactions_page("a", "key", date_from=date(2026, 9, 1))
        assert mock_get.call_args.args[0] == "/v2/transactions?accountId=a&dateFrom=2026-09-01"

    def test_created_at_from_param_is_utc_iso(self):
        created = datetime(2026, 10, 1, 21, 30, 5, tzinfo=timezone(timedelta(hours=-3)))
        with patch("src.sources.pluggy.provider._pluggy_get", return_value={"results": []}) as mock_get:
            fetch_transactions_page("a", "key", created_at_from=created)
        assert mock_get.call_args.args[0] == "/v2/transactions?accountId=a&createdAtFrom=2026-10-02T00:30:05.000Z"

    def test_no_filters_fetches_full_history(self):
        with patch("src.sources.pluggy.provider._pluggy_get", return_value={"results": []}) as mock_get:
            fetch_transactions_page("a", "key")
        assert mock_get.call_args.args[0] == "/v2/transactions?accountId=a"

    def test_date_from_and_created_at_from_are_mutually_exclusive(self):
        with pytest.raises(ValueError):
            fetch_transactions_page("a", "key", date_from=date(2026, 9, 1), created_at_from=datetime(2026, 9, 1, tzinfo=timezone.utc))

    def test_urlopen_uses_timeout(self):
        resp = MagicMock()
        resp.read.return_value = b'{"results": []}'
        fake_ctx = MagicMock()
        fake_ctx.__enter__.return_value = resp
        with patch(
            "src.sources.pluggy.provider.urllib.request.urlopen",
            return_value=fake_ctx,
        ) as mock_urlopen:
            fetch_transactions_page("acct-uuid", "key", date_from=date(2026, 9, 1))

        assert mock_urlopen.call_args.kwargs.get("timeout") == 30


class TestProviderTimezone:
    def test_fetch_transactions_applies_provider_timezone(self):
        raw_tx = {
            "id": "t1",
            "date": "2026-01-01T02:00:00.000Z",
            "description": "Compra",
            "amount": 10.0,
            "type": "DEBIT",
            "status": "POSTED",
        }
        with patch("src.sources.pluggy.provider._get_api_key", return_value="key"), \
             patch("src.sources.pluggy.provider._pluggy_get",
                   return_value={"results": [raw_tx], "next": None}):
            provider = PluggyProvider("cid", "csec", tz="America/Sao_Paulo")
            txs = provider.fetch_transactions("acct", date(2025, 12, 1))

        # 02:00Z → 23:00 BRT on Dec 31
        assert txs[0].payment_date == date(2025, 12, 31)


class TestInvoicePaymentFilterByAccountType:
    def _invoice_tx(self):
        return {
            "id": "inv1", "date": "2026-09-08T12:00:00.000Z",
            "description": "Pagamento de boleto Fatura Cartao BTG Pactual",
            "categoryId": INVOICE_PAYMENT_CATEGORY,
            "amount": 16258.03, "type": "DEBIT", "status": "POSTED",
        }

    def test_kept_for_bank_account(self):
        with patch("src.sources.pluggy.provider._get_api_key", return_value="key"), \
             patch("src.sources.pluggy.provider._pluggy_get",
                   return_value={"results": [self._invoice_tx()], "next": None}):
            provider = PluggyProvider("cid", "csec", tz="UTC")
            txs = provider.fetch_transactions("acct", date(2026, 9, 1), account_type="bank")

        assert [t.statement_identifier for t in txs] == ["pluggy:inv1"]

    def test_excluded_for_credit_card_account(self):
        with patch("src.sources.pluggy.provider._get_api_key", return_value="key"), \
             patch("src.sources.pluggy.provider._pluggy_get",
                   return_value={"results": [self._invoice_tx()], "next": None}):
            provider = PluggyProvider("cid", "csec", tz="UTC")
            txs = provider.fetch_transactions("acct", date(2026, 9, 1), account_type="credit_card")

        assert txs == []


class TestFutureTransactionFilter:
    def test_future_transaction_is_filtered_out(self):
        future = {
            "id": "fut", "date": "2099-01-01T03:00:00.000Z",
            "description": "Prestacao futura", "amount": 1.0, "type": "DEBIT", "status": "POSTED",
        }
        past = {
            "id": "pst", "date": "2026-01-01T03:00:00.000Z",
            "description": "Compra", "amount": 1.0, "type": "DEBIT", "status": "POSTED",
        }
        with patch("src.sources.pluggy.provider._get_api_key", return_value="key"), \
             patch("src.sources.pluggy.provider._pluggy_get",
                   return_value={"results": [future, past], "next": None}):
            provider = PluggyProvider("cid", "csec", tz="UTC")
            txs = provider.fetch_transactions("acct", date(2026, 1, 1))

        assert [t.statement_identifier for t in txs] == ["pluggy:pst"]


# ── to_pfm_transaction ────────────────────────────────────────────────────────

def _make_cc_tx(**kwargs):
    base = {
        "id": "uuid-001",
        "date": "2026-09-08",
        "description": "Amazon Prime",
        "amount": 45.99,
        "type": "DEBIT",
        "status": "POSTED",
    }
    base.update(kwargs)
    return base


class TestToPfmTransaction:
    def test_debit_amount_is_negative(self):
        tx = to_pfm_transaction(_make_cc_tx(amount=45.99, type="DEBIT"))
        assert tx.amount == Decimal("-45.99")

    def test_credit_amount_is_positive(self):
        tx = to_pfm_transaction(_make_cc_tx(amount=10.00, type="CREDIT"))
        assert tx.amount == Decimal("10.00")

    def test_posted_maps_to_pending(self):
        tx = to_pfm_transaction(_make_cc_tx(status="POSTED"))
        assert tx.status_id == 1

    def test_pending_status(self):
        tx = to_pfm_transaction(_make_cc_tx(status="PENDING"))
        assert tx.status_id == 1

    def test_missing_status_maps_to_pending(self):
        raw = _make_cc_tx()
        del raw["status"]
        assert to_pfm_transaction(raw).status_id == 1

    def test_statement_identifier_format(self):
        tx = to_pfm_transaction(_make_cc_tx(id="my-uuid"))
        assert tx.statement_identifier == "pluggy:my-uuid"

    def test_purchase_date_from_metadata(self):
        raw = _make_cc_tx(creditCardMetadata={"purchaseDate": "2026-09-01"})
        tx = to_pfm_transaction(raw)
        assert tx.purchase_date == date(2026, 9, 1)

    def test_purchase_date_falls_back_to_payment_date(self):
        tx = to_pfm_transaction(_make_cc_tx())
        assert tx.purchase_date == tx.payment_date

    def test_installment_fields_mapped(self):
        raw = _make_cc_tx(creditCardMetadata={"installmentNumber": 2, "totalInstallments": 12})
        tx = to_pfm_transaction(raw)
        assert tx.installment_number == 2
        assert tx.installment_total == 12

    def test_installment_fields_none_without_metadata(self):
        tx = to_pfm_transaction(_make_cc_tx())
        assert tx.installment_number is None
        assert tx.installment_total is None

    def test_credit_with_different_bill_forecast_adjusts_payment_date(self):
        raw = _make_cc_tx(
            type="CREDIT",
            date="2026-09-08",
            creditCardMetadata={"billForecastDate": "2026-10"},
        )
        tx = to_pfm_transaction(raw)
        assert tx.payment_date == date(2026, 10, 1)

    def test_payee_has_installment_suffix_stripped(self):
        raw = _make_cc_tx(description="Netflix 03/12", creditCardMetadata={"installmentNumber": 3})
        tx = to_pfm_transaction(raw)
        assert tx.payee == "Netflix"

    def test_returns_pfm_transaction(self):
        tx = to_pfm_transaction(_make_cc_tx())
        assert isinstance(tx, PfmTransaction)

    def test_amount_is_decimal_exact_from_float(self):
        tx = to_pfm_transaction(_make_cc_tx(amount=0.1, type="DEBIT"))
        assert isinstance(tx.amount, Decimal)
        assert tx.amount == Decimal("-0.1")

    def test_amount_is_decimal_exact_from_string(self):
        tx = to_pfm_transaction(_make_cc_tx(amount="1234.56", type="DEBIT"))
        assert isinstance(tx.amount, Decimal)
        assert tx.amount == Decimal("-1234.56")


# ── to_pfm_transaction_bank ───────────────────────────────────────────────────

def _make_bank_tx(**kwargs):
    base = {
        "id": "bank-uuid-001",
        "date": "2026-09-08",
        "description": "Pix enviado Empresa",
        "amount": 100.00,
        "type": "DEBIT",
        "status": "POSTED",
    }
    base.update(kwargs)
    return base


class TestToPfmTransactionBank:
    def test_debit_amount_is_negative(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(amount=100.00, type="DEBIT"))
        assert tx.amount == Decimal("-100.00")

    def test_credit_amount_is_positive(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(amount=50.00, type="CREDIT"))
        assert tx.amount == Decimal("50.00")

    def test_purchase_date_equals_payment_date(self):
        tx = to_pfm_transaction_bank(_make_bank_tx())
        assert tx.purchase_date == tx.payment_date

    def test_posted_maps_to_pending(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(status="POSTED"))
        assert tx.status_id == 1

    def test_pending_status(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(status="PENDING"))
        assert tx.status_id == 1

    def test_missing_status_maps_to_pending(self):
        raw = _make_bank_tx()
        del raw["status"]
        assert to_pfm_transaction_bank(raw).status_id == 1

    def test_statement_identifier_format(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(id="bank-uuid"))
        assert tx.statement_identifier == "pluggy:bank-uuid"

    def test_payee_goes_through_clean_bank_payee(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(description="Pix enviado João", type="DEBIT"))
        assert tx.payee == "PIX João"

    def test_no_installment_fields(self):
        tx = to_pfm_transaction_bank(_make_bank_tx())
        assert tx.installment_number is None
        assert tx.installment_total is None

    def test_amount_is_decimal_exact_from_float(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(amount=0.1, type="DEBIT"))
        assert isinstance(tx.amount, Decimal)
        assert tx.amount == Decimal("-0.1")

    def test_amount_is_decimal_exact_from_string(self):
        tx = to_pfm_transaction_bank(_make_bank_tx(amount="1234.56", type="DEBIT"))
        assert isinstance(tx.amount, Decimal)
        assert tx.amount == Decimal("-1234.56")


class TestForeignCurrency:
    def test_cc_usd_uses_amount_in_account_currency(self):
        raw = _make_cc_tx(amount=10.00, currencyCode="USD", amountInAccountCurrency=52.30)
        assert to_pfm_transaction(raw).amount == Decimal("-52.30")

    def test_bank_usd_credit_uses_amount_in_account_currency(self):
        raw = _make_bank_tx(amount=20.00, type="CREDIT", currencyCode="USD", amountInAccountCurrency=105.10)
        assert to_pfm_transaction_bank(raw).amount == Decimal("105.10")

    def test_brl_ignores_amount_in_account_currency(self):
        raw = _make_cc_tx(amount=45.99, currencyCode="BRL", amountInAccountCurrency=None)
        assert to_pfm_transaction(raw).amount == Decimal("-45.99")

    def test_missing_currency_code_uses_amount(self):
        assert to_pfm_transaction(_make_cc_tx(amount=45.99)).amount == Decimal("-45.99")

    def test_usd_without_conversion_raises(self):
        raw = _make_cc_tx(currencyCode="USD", amountInAccountCurrency=None)
        with pytest.raises(ValueError, match="amountInAccountCurrency"):
            to_pfm_transaction(raw)

    def test_fetch_skips_unconverted_foreign_tx_and_keeps_others(self):
        usd = {"id": "usd", "date": "2026-01-01T03:00:00.000Z", "description": "Foreign",
               "amount": 5.0, "type": "DEBIT", "status": "POSTED", "currencyCode": "USD"}
        brl = {"id": "brl", "date": "2026-01-01T03:00:00.000Z", "description": "Compra",
               "amount": 1.0, "type": "DEBIT", "status": "POSTED", "currencyCode": "BRL"}
        with patch("src.sources.pluggy.provider._get_api_key", return_value="key"), \
             patch("src.sources.pluggy.provider._pluggy_get",
                   return_value={"results": [usd, brl], "next": None}):
            txs = PluggyProvider("cid", "csec", tz="UTC").fetch_transactions("acct", date(2026, 1, 1))
        assert [t.statement_identifier for t in txs] == ["pluggy:brl"]


class TestAutoInvestmentFilter:
    def _txs(self):
        return [
            {"id": "sweep", "date": "2026-09-08T12:00:00.000Z",
             "description": "Aplicação APL APLIC AUT MAIS",
             "categoryId": AUTO_INVESTMENT_CATEGORY,
             "amount": -100.0, "type": "DEBIT", "status": "POSTED"},
            {"id": "yield", "date": "2026-09-08T12:00:00.000Z",
             "description": "Rendimentos REND PAGO APLIC AUT MAIS",
             "categoryId": "03060000",
             "amount": 0.28, "type": "CREDIT", "status": "POSTED"},
        ]

    def _fetch(self, account_type):
        with patch("src.sources.pluggy.provider._get_api_key", return_value="key"), \
             patch("src.sources.pluggy.provider._pluggy_get",
                   return_value={"results": self._txs(), "next": None}):
            provider = PluggyProvider("cid", "csec", tz="UTC")
            return provider.fetch_transactions("acct", date(2026, 9, 1), account_type=account_type)

    def test_sweep_skipped_for_bank_account(self):
        assert [t.statement_identifier for t in self._fetch("bank")] == ["pluggy:yield"]

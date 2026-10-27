-- Expose the two money-formatting knobs the formatter already supported but
-- settings never persisted: how the currency marker renders, and whether cents
-- are shown. Both are seeded from the chosen currency in the UI and remain
-- independently overridable.
--
-- currency_display maps to Intl.NumberFormat's currencyDisplay, plus 'none' for
-- a bare number: 'symbol' | 'narrowSymbol' | 'code' | 'none'.

ALTER TABLE "public"."settings"
  ADD COLUMN IF NOT EXISTS "currency_display" text DEFAULT 'symbol' NOT NULL,
  ADD COLUMN IF NOT EXISTS "hide_cents" boolean DEFAULT false NOT NULL;

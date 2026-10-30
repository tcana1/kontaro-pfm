-- Installments of a still-open card bill: count them in the month they belong to.
--
-- For a series whose installment of this month has not been reported yet (the
-- same `is_due_this_month` predicate as get_projected_installments), `paid` and
-- `remaining` are frozen at last month. The installment that is "next" for such
-- a series is the one of THIS month, not the following one. Two things went
-- wrong because of it:
--
--   * a series with one installment left (remaining = 1) that is due this month
--     ends THIS month, but `ending_this_month` only looked at installments that
--     had already landed, so it missed every one still on the open bill;
--   * the 12-month timeline starts each series one month late for the same
--     reason (the client fixes that using the new `is_due_this_month` flag).
--
-- `ending_this_month` therefore also lists those series, flagged `projected`,
-- and `ending_next_month` is new: series whose last installment falls next month,
-- counting remaining = 2 for a due series and remaining = 1 for one that landed.
-- Nothing is stored or added into a total; the projected entries are inferred.
--
-- resolve_installment_series is deliberately untouched: it describes what is
-- stored, and a projection must not leak into it.
CREATE OR REPLACE FUNCTION "public"."get_dashboard_installments"("p_month" "date") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result  json;
  v_end   date := (p_month + INTERVAL '1 month')::date;
  -- a series whose most recent installment predates this is considered stalled
  v_stale date := (p_month - INTERVAL '2 month')::date;
BEGIN
  WITH c AS (
    SELECT s.*,
      (s.remaining > 0 AND s.last_pay >= v_stale) AS is_active,
      (s.remaining > 0 AND s.last_pay <  v_stale) AS is_stalled,
      -- mirrors public.get_projected_installments
      (s.remaining > 0 AND s.last_pay >= v_stale AND s.last_pay < p_month) AS is_due_this_month
    FROM public.resolve_installment_series(v_end) s
  )
  SELECT json_build_object(
    'active', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payee',             c.payee,
          'purchase_date',     c.purchase_date,
          'installment_total', c.installment_total,
          'paid',              c.paid,
          'remaining',         c.remaining,
          'monthly_amount',    c.monthly_amount,
          'is_due_this_month', c.is_due_this_month
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c WHERE c.is_active
    ),
    'stalled', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payee',             c.payee,
          'purchase_date',     c.purchase_date,
          'installment_total', c.installment_total,
          'paid',              c.paid,
          'remaining',         c.remaining,
          'monthly_amount',    c.monthly_amount,
          'last_pay',          c.last_pay
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c WHERE c.is_stalled
    ),
    'ending_this_month', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payee',             c.payee,
          'purchase_date',     c.purchase_date,
          'installment_total', c.installment_total,
          'monthly_amount',    c.monthly_amount,
          'projected',         (c.is_due_this_month AND c.remaining = 1)
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c
      WHERE (c.final_pay_date >= p_month AND c.final_pay_date < v_end)
         OR (c.is_due_this_month AND c.remaining = 1)
    ),
    'ending_next_month', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payee',             c.payee,
          'purchase_date',     c.purchase_date,
          'installment_total', c.installment_total,
          'monthly_amount',    c.monthly_amount
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c
      WHERE c.is_active
        AND c.remaining = CASE WHEN c.is_due_this_month THEN 2 ELSE 1 END
    ),
    'starting_this_month', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payee',             c.payee,
          'purchase_date',     c.purchase_date,
          'installment_total', c.installment_total,
          'monthly_amount',    c.monthly_amount
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c
      WHERE c.start_pay_date >= p_month AND c.start_pay_date < v_end
    ),
    'due_this_month', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'payee',             c.payee,
          'purchase_date',     c.purchase_date,
          'installment_total', c.installment_total,
          'paid',              c.paid,
          'monthly_amount',    c.monthly_amount,
          'last_pay',          c.last_pay
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c WHERE c.is_due_this_month
    ),
    'due_this_month_total', (
      SELECT ROUND(COALESCE(SUM(c.monthly_amount), 0), 2)
      FROM c WHERE c.is_due_this_month
    )
  ) INTO result;

  RETURN result;
END;
$$;

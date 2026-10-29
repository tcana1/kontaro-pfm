-- Fold the installment projection into the pro-rata MoM/YoY comparison.
--
-- The open card bill reports no installment at all, while the prior month and
-- the same month last year are closed and carry theirs. So even the
-- equal-elapsed-days window understates the month in progress by exactly the
-- amount the dashboard shows as "projected", and MoM/YoY read as a saving that
-- is not there.
--
-- `projected_installments` keeps its whole-month meaning (the headline figure,
-- and what mcp/server.py exposes). `projected_mtd` is the same projection cut
-- to the elapsed-days window: a series is counted once the day of the month it
-- usually lands on has passed, taken from the day of its most recent
-- installment. Adding the full month's projection to a window of a few days
-- would just invert the bias the pro-rata cut exists to remove.
--
-- `projected_mtd` is NULL for a closed month, like the other MTD fields: there
-- is no window to cut, and the whole-month `projected_installments` applies.
--
-- Both stay OUT of current_net / mtd_net: they are inferred, never stored, and
-- no actual total may include them.

CREATE OR REPLACE FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date", "p_today" "date" DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_end         DATE := (p_month + INTERVAL '1 month')::DATE;
  v_prior_start DATE := (p_month - INTERVAL '1 month')::DATE;
  v_ly_start    DATE := (p_month - INTERVAL '1 year')::DATE;
  v_ly_end      DATE := (p_month - INTERVAL '1 year' + INTERVAL '1 month')::DATE;
  v_is_current  BOOLEAN := p_month = DATE_TRUNC('month', p_today)::DATE;
  v_month_days  INTEGER := v_end - p_month;
  v_days        INTEGER;
  v_mtd_end     DATE;
  v_prior_mtd_end DATE;
  v_ly_mtd_end  DATE;
  v_current     NUMERIC;
  v_gross       NUMERIC;
  v_reimb       NUMERIC;
  v_prior       NUMERIC;
  v_ly          NUMERIC;
  v_mtd         NUMERIC;
  v_prior_mtd   NUMERIC;
  v_ly_mtd      NUMERIC;
  v_proj        NUMERIC;
  v_proj_mtd    NUMERIC;
BEGIN
  SELECT ROUND(SUM(ts.amount * -1)::numeric, 2),
         ROUND(SUM(ts.amount * -1) FILTER (WHERE ts.amount < 0)::numeric, 2),
         ROUND(SUM(ts.amount) FILTER (WHERE ts.amount > 0)::numeric, 2)
    INTO v_current, v_gross, v_reimb
  FROM transactions t
  JOIN transaction_splits ts      ON t.id = ts.transaction_id
  LEFT JOIN categories c          ON ts.category_id = c.id
  LEFT JOIN category_groups cg    ON c.group_id = cg.id
  WHERE t.user_id = auth.uid()
    AND t.payment_date >= p_month AND t.payment_date < v_end
    AND (cg.is_income = FALSE OR cg.is_income IS NULL)
    AND ts.category_id >= 0
    AND t.is_ignored = FALSE;

  SELECT ROUND(SUM(ts.amount * -1)::numeric, 2) INTO v_prior
  FROM transactions t
  JOIN transaction_splits ts      ON t.id = ts.transaction_id
  LEFT JOIN categories c          ON ts.category_id = c.id
  LEFT JOIN category_groups cg    ON c.group_id = cg.id
  WHERE t.user_id = auth.uid()
    AND t.payment_date >= v_prior_start AND t.payment_date < p_month
    AND (cg.is_income = FALSE OR cg.is_income IS NULL)
    AND ts.category_id >= 0
    AND t.is_ignored = FALSE;

  SELECT ROUND(SUM(ts.amount * -1)::numeric, 2) INTO v_ly
  FROM transactions t
  JOIN transaction_splits ts      ON t.id = ts.transaction_id
  LEFT JOIN categories c          ON ts.category_id = c.id
  LEFT JOIN category_groups cg    ON c.group_id = cg.id
  WHERE t.user_id = auth.uid()
    AND t.payment_date >= v_ly_start AND t.payment_date < v_ly_end
    AND (cg.is_income = FALSE OR cg.is_income IS NULL)
    AND ts.category_id >= 0
    AND t.is_ignored = FALSE;

  IF v_is_current THEN
    v_days          := p_today - p_month + 1;
    v_mtd_end       := p_today + 1;
    -- LEAST() keeps a short comparison month from spilling into the next one,
    -- which is also what makes the windows converge on the last day of a month.
    v_prior_mtd_end := LEAST(v_prior_start + v_days, p_month);
    v_ly_mtd_end    := LEAST(v_ly_start + v_days, v_ly_end);

    SELECT ROUND(COALESCE(SUM(ts.amount * -1) FILTER (WHERE t.payment_date >= p_month       AND t.payment_date < v_mtd_end), 0)::numeric, 2),
           ROUND(COALESCE(SUM(ts.amount * -1) FILTER (WHERE t.payment_date >= v_prior_start AND t.payment_date < v_prior_mtd_end), 0)::numeric, 2),
           ROUND(COALESCE(SUM(ts.amount * -1) FILTER (WHERE t.payment_date >= v_ly_start    AND t.payment_date < v_ly_mtd_end), 0)::numeric, 2)
      INTO v_mtd, v_prior_mtd, v_ly_mtd
    FROM transactions t
    JOIN transaction_splits ts      ON t.id = ts.transaction_id
    LEFT JOIN categories c          ON ts.category_id = c.id
    LEFT JOIN category_groups cg    ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= v_ly_start AND t.payment_date < v_mtd_end
      AND (cg.is_income = FALSE OR cg.is_income IS NULL)
      AND ts.category_id >= 0
      AND t.is_ignored = FALSE;
  END IF;

  -- LEAST(..., v_month_days) keeps a series that lands on the 31st from falling
  -- out of the window in a 30-day month.
  SELECT ROUND(COALESCE(SUM(p.monthly_amount), 0)::numeric, 2),
         CASE WHEN v_is_current THEN
           ROUND(COALESCE(SUM(p.monthly_amount) FILTER (
             WHERE LEAST(EXTRACT(DAY FROM p.last_pay)::integer, v_month_days) <= v_days
           ), 0)::numeric, 2)
         END
    INTO v_proj, v_proj_mtd
  FROM public.get_projected_installments(p_month) p;

  RETURN json_build_object(
    'current_net',             COALESCE(v_current, 0),
    'current_gross',           COALESCE(v_gross,   0),
    'current_reimbursements',  COALESCE(v_reimb,   0),
    'prior_net',               COALESCE(v_prior,   0),
    'prior_year_net',          COALESCE(v_ly,      0),
    'projected_installments',  COALESCE(v_proj,    0),
    'projected_mtd',           v_proj_mtd,
    'mtd_net',                 v_mtd,
    'prior_mtd_net',           v_prior_mtd,
    'prior_year_mtd_net',      v_ly_mtd,
    'comparison_days',         v_days,
    'comparison_through',      CASE WHEN v_is_current THEN p_today END
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date", "p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date", "p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date", "p_today" "date") TO "service_role";

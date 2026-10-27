-- Pro-rata MoM/YoY comparison for the month in progress.
--
-- Comparing a half-finished month against two whole months makes every MoM/YoY
-- delta look like a huge saving until the last day of the month. For the current
-- month we therefore also return an equal-elapsed-days window (day 1 through
-- today) for the month, the prior month and the same month last year. Closed
-- months keep the whole-calendar-month comparison, so a 28-day February is never
-- measured against a 31-day January.
--
-- The MTD fields are additive: current_net / prior_net / prior_year_net keep
-- their full-calendar-month meaning because mcp/server.py exposes the same JSON
-- to the monthly analysis.
--
-- p_today comes from the client (same contract as get_account_balances) so the
-- cut uses the user's local date instead of the server's timezone.

DROP FUNCTION IF EXISTS "public"."get_dashboard_monthly_totals"("p_month" "date");

CREATE OR REPLACE FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date", "p_today" "date" DEFAULT CURRENT_DATE) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_end         DATE := (p_month + INTERVAL '1 month')::DATE;
  v_prior_start DATE := (p_month - INTERVAL '1 month')::DATE;
  v_ly_start    DATE := (p_month - INTERVAL '1 year')::DATE;
  v_ly_end      DATE := (p_month - INTERVAL '1 year' + INTERVAL '1 month')::DATE;
  v_is_current  BOOLEAN := p_month = DATE_TRUNC('month', p_today)::DATE;
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

  SELECT ROUND(COALESCE(SUM(p.monthly_amount), 0)::numeric, 2) INTO v_proj
  FROM public.get_projected_installments(p_month) p;

  RETURN json_build_object(
    'current_net',             COALESCE(v_current, 0),
    'current_gross',           COALESCE(v_gross,   0),
    'current_reimbursements',  COALESCE(v_reimb,   0),
    'prior_net',               COALESCE(v_prior,   0),
    'prior_year_net',          COALESCE(v_ly,      0),
    'projected_installments',  COALESCE(v_proj,    0),
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

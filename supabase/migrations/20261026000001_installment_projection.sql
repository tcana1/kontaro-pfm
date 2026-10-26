-- Projection for the installments of a still-open credit-card bill.
--
-- The provider (Pluggy) does not deliver the installment of the bill that is
-- currently open: while the bill is open the row exists dated at the DUE date
-- (in the future), and the importer caps imports at yesterday, so it is
-- dropped. At closing the provider destroys that row and recreates it with a
-- new id and a date inside the cycle — so importing it early would duplicate
-- it later (the sync dedupes by `statement_identifier = pluggy:<id>`).
--
-- Instead of importing, we derive it: a series with installments left whose
-- most recent installment landed before this month is owed one installment
-- this month, of its known monthly amount. Nothing is written, and the
-- projection disappears on its own once the real row lands (last_pay moves
-- into the month).
--
-- Projected amounts are returned as separate fields and are NEVER folded into
-- an existing total — reconciliation and the month's actuals stay untouched.

ALTER TABLE "public"."settings"
  ADD COLUMN IF NOT EXISTS "show_installment_projection" boolean DEFAULT false NOT NULL;


-- Series owed an installment in p_month's cycle that has not landed yet.
-- NOTE: get_dashboard_installments restates this predicate inline (it already
-- has the series resolved in a CTE and needs `stale` to stay consistent with
-- its own active/stalled buckets). Keep the two in sync — the pgTAP test
-- asserts they agree on the same fixture.
CREATE OR REPLACE FUNCTION "public"."get_projected_installments"("p_month" "date")
  RETURNS TABLE(
    "account_id" integer,
    "payee" "text",
    "purchase_date" "date",
    "installment_total" integer,
    "paid" integer,
    "monthly_amount" numeric,
    "last_pay" "date"
  )
  LANGUAGE "sql" STABLE
  AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month)::date                              AS cur,
           (date_trunc('month', p_month) + INTERVAL '1 month')::date       AS nxt,
           -- a series whose most recent installment predates this is stalled,
           -- not merely late: do not keep projecting it forever
           (date_trunc('month', p_month) - INTERVAL '2 month')::date       AS stale
  )
  SELECT s.account_id, s.payee, s.purchase_date, s.installment_total, s.paid,
         s.monthly_amount, s.last_pay
  FROM b
  CROSS JOIN LATERAL public.resolve_installment_series(b.nxt) s
  WHERE s.remaining > 0
    AND s.last_pay >= b.stale
    AND s.last_pay <  b.cur;
$$;

ALTER FUNCTION "public"."get_projected_installments"("p_month" "date") OWNER TO "postgres";
REVOKE ALL  ON FUNCTION "public"."get_projected_installments"("p_month" "date") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_projected_installments"("p_month" "date") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_projected_installments"("p_month" "date") TO "service_role";


-- get_dashboard_installments: adds the `due_this_month` bucket.
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
          'monthly_amount',    c.monthly_amount
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
          'monthly_amount',    c.monthly_amount
        ) ORDER BY c.monthly_amount DESC
      ), '[]'::json)
      FROM c
      WHERE c.final_pay_date >= p_month AND c.final_pay_date < v_end
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


-- get_dashboard_monthly_totals: adds `projected_installments`, positive like
-- current_net (spending). Not added into any of the existing totals.
CREATE OR REPLACE FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_end         DATE := (p_month + INTERVAL '1 month')::DATE;
  v_prior_start DATE := (p_month - INTERVAL '1 month')::DATE;
  v_ly_start    DATE := (p_month - INTERVAL '1 year')::DATE;
  v_ly_end      DATE := (p_month - INTERVAL '1 year' + INTERVAL '1 month')::DATE;
  v_current     NUMERIC;
  v_gross       NUMERIC;
  v_reimb       NUMERIC;
  v_prior       NUMERIC;
  v_ly          NUMERIC;
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

  SELECT ROUND(COALESCE(SUM(p.monthly_amount), 0)::numeric, 2) INTO v_proj
  FROM public.get_projected_installments(p_month) p;

  RETURN json_build_object(
    'current_net',             COALESCE(v_current, 0),
    'current_gross',           COALESCE(v_gross,   0),
    'current_reimbursements',  COALESCE(v_reimb,   0),
    'prior_net',               COALESCE(v_prior,   0),
    'prior_year_net',          COALESCE(v_ly,      0),
    'projected_installments',  COALESCE(v_proj,    0)
  );
END;
$$;


-- get_account_balances: adds `projected_balance`, signed like the stored
-- amounts (negative on a card). Deliberately outside the
-- cleared + pending = total identity that reconciliation relies on.
DROP FUNCTION IF EXISTS "public"."get_account_balances"("account_id_param" integer, "p_today" "date");

CREATE OR REPLACE FUNCTION "public"."get_account_balances"("account_id_param" integer DEFAULT NULL::integer, "p_today" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("account_id" integer, "account_name" character varying, "account_type_id" integer, "starting_balance" numeric, "cleared_balance" numeric, "pending_balance" numeric, "total_balance" numeric, "projected_balance" numeric)
    LANGUAGE "sql"
    AS $$
  WITH account_transactions AS (
    SELECT
      a.id as a_id,
      a.name as a_name,
      a.type_id as a_type_id,
      COALESCE(SUM(CASE WHEN s.category_id = -3 THEN s.amount ELSE 0 END), 0) as starting_balance_calc,
      COALESCE(SUM(CASE WHEN t.status_id = 2 THEN s.amount ELSE 0 END), 0) as cleared_balance_calc,
      COALESCE(SUM(CASE WHEN t.status_id = 1 THEN s.amount ELSE 0 END), 0) as pending_balance_calc,
      COALESCE(SUM(s.amount), 0) as total_balance_calc
    FROM accounts a
    LEFT JOIN transactions t ON a.id = t.account_id AND t.payment_date <= p_today
    LEFT JOIN transaction_splits s ON s.transaction_id = t.id
    WHERE (account_id_param IS NULL OR a.id = account_id_param)
      AND a.is_active = true
    GROUP BY a.id, a.name, a.type_id
  ),
  proj AS (
    SELECT p.account_id AS p_account_id, SUM(p.monthly_amount) AS projected_calc
    FROM public.get_projected_installments(p_today) p
    GROUP BY p.account_id
  )
  SELECT
    acc.a_id::INT,
    acc.a_name::VARCHAR(255),
    acc.a_type_id::INT,
    acc.starting_balance_calc::DECIMAL,
    acc.cleared_balance_calc::DECIMAL,
    acc.pending_balance_calc::DECIMAL,
    acc.total_balance_calc::DECIMAL,
    (COALESCE(pr.projected_calc, 0) * -1)::DECIMAL
  FROM account_transactions acc
  LEFT JOIN proj pr ON pr.p_account_id = acc.a_id
  ORDER BY acc.a_name ASC;
$$;

ALTER FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") OWNER TO "postgres";
REVOKE ALL  ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") TO "service_role";


-- get_month_close: adds a top-level `projection` block. The UI's feature flag
-- does not reach here on purpose — the monthly analysis should always see it.
CREATE OR REPLACE FUNCTION "public"."get_month_close"("p_month" "date") RETURNS json
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month)::date                              AS cur,
           (date_trunc('month', p_month) + INTERVAL '1 month')::date       AS nxt,
           (date_trunc('month', p_month) - INTERVAL '1 month')::date       AS prv,
           (date_trunc('month', p_month) - INTERVAL '3 month')::date       AS m3,
           (date_trunc('month', p_month) - INTERVAL '1 year')::date        AS ly,
           (date_trunc('month', p_month) - INTERVAL '1 year' + INTERVAL '1 month')::date AS ly_end
  ),
  s AS (
    SELECT c.id AS category_id, c.name AS category, cg.name AS category_group, ts.amount,
           CASE WHEN t.payment_date >= b.cur AND t.payment_date < b.nxt    THEN 'cur'
                WHEN t.payment_date >= b.prv AND t.payment_date < b.cur    THEN 'prv'
                WHEN t.payment_date >= b.ly  AND t.payment_date < b.ly_end THEN 'ly'
           END AS p,
           (t.payment_date >= b.m3 AND t.payment_date < b.cur) AS in3
    FROM b
    CROSS JOIN transactions t
    JOIN transaction_splits ts ON ts.transaction_id = t.id
    JOIN categories c          ON c.id = ts.category_id
    LEFT JOIN category_groups cg ON cg.id = c.group_id
    WHERE t.user_id = (SELECT auth.uid())
      AND t.is_ignored = FALSE
      AND ts.category_id >= 0
      AND COALESCE(cg.is_income, FALSE) = FALSE
      AND t.payment_date >= LEAST(b.ly, b.m3)
      AND t.payment_date <  b.nxt
  ),
  cat AS (
    SELECT category_id, category, category_group,
           COALESCE(SUM(-amount) FILTER (WHERE p = 'cur' AND amount < 0), 0) AS gross,
           COALESCE(SUM(amount)  FILTER (WHERE p = 'cur' AND amount > 0), 0) AS reimb,
           COALESCE(SUM(-amount) FILTER (WHERE p = 'cur'), 0)                AS net,
           COALESCE(SUM(-amount) FILTER (WHERE p = 'prv'), 0)                AS prior_net,
           COALESCE(SUM(-amount) FILTER (WHERE p = 'ly'), 0)                 AS prior_year_net,
           COALESCE(SUM(-amount) FILTER (WHERE in3), 0) / 3                  AS avg_3m_net
    FROM s
    GROUP BY category_id, category, category_group
  ),
  tot AS (
    SELECT
      COALESCE(SUM(-amount) FILTER (WHERE p = 'cur' AND amount < 0), 0) AS cur_gross,
      COALESCE(SUM(amount)  FILTER (WHERE p = 'cur' AND amount > 0), 0) AS cur_reimb,
      COALESCE(SUM(-amount) FILTER (WHERE p = 'cur'), 0)                AS cur_net,
      COALESCE(SUM(-amount) FILTER (WHERE p = 'prv' AND amount < 0), 0) AS prv_gross,
      COALESCE(SUM(amount)  FILTER (WHERE p = 'prv' AND amount > 0), 0) AS prv_reimb,
      COALESCE(SUM(-amount) FILTER (WHERE p = 'prv'), 0)                AS prv_net,
      COALESCE(SUM(-amount) FILTER (WHERE p = 'ly' AND amount < 0), 0)  AS ly_gross,
      COALESCE(SUM(amount)  FILTER (WHERE p = 'ly' AND amount > 0), 0)  AS ly_reimb,
      COALESCE(SUM(-amount) FILTER (WHERE p = 'ly'), 0)                 AS ly_net,
      COALESCE(SUM(-amount) FILTER (WHERE in3), 0) / 3                  AS avg_3m_net
    FROM s
  ),
  pr AS (
    SELECT p.* FROM b CROSS JOIN LATERAL public.get_projected_installments(b.cur) p
  )
  SELECT json_build_object(
    'month', (SELECT cur FROM b),
    'basis', 'payment_date; non-ignored splits in non-income categories',
    'totals', (
      SELECT json_build_object(
        'current',    json_build_object('gross', ROUND(cur_gross, 2), 'reimbursements', ROUND(cur_reimb, 2), 'net', ROUND(cur_net, 2)),
        'prior',      json_build_object('gross', ROUND(prv_gross, 2), 'reimbursements', ROUND(prv_reimb, 2), 'net', ROUND(prv_net, 2)),
        'prior_year', json_build_object('gross', ROUND(ly_gross, 2),  'reimbursements', ROUND(ly_reimb, 2),  'net', ROUND(ly_net, 2)),
        'avg_3m_net', ROUND(avg_3m_net, 2),
        'mom_pct',    CASE WHEN prv_net <> 0 THEN ROUND((cur_net - prv_net) / prv_net * 100, 1) END,
        'yoy_pct',    CASE WHEN ly_net  <> 0 THEN ROUND((cur_net - ly_net)  / ly_net  * 100, 1) END
      ) FROM tot
    ),
    'projection', json_build_object(
      'basis',  'installments of a still-open card bill, inferred from each series'' monthly amount; NOT included in totals or categories',
      'amount', (SELECT ROUND(COALESCE(SUM(monthly_amount), 0), 2) FROM pr),
      'series', (
        SELECT COALESCE(json_agg(
          json_build_object(
            'payee',             payee,
            'account_id',        account_id,
            'purchase_date',     purchase_date,
            'installment_total', installment_total,
            'paid',              paid,
            'monthly_amount',    ROUND(monthly_amount, 2),
            'last_pay',          last_pay
          ) ORDER BY monthly_amount DESC
        ), '[]'::json)
        FROM pr
      )
    ),
    'categories', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'category_id',    category_id,
          'category',       category,
          'group',          category_group,
          'gross',          ROUND(gross, 2),
          'reimbursements', ROUND(reimb, 2),
          'net',            ROUND(net, 2),
          'prior_net',      ROUND(prior_net, 2),
          'prior_year_net', ROUND(prior_year_net, 2),
          'avg_3m_net',     ROUND(avg_3m_net, 2)
        ) ORDER BY net DESC, category
      ), '[]'::json)
      FROM cat
      WHERE gross <> 0 OR reimb <> 0 OR prior_net <> 0 OR avg_3m_net <> 0
    )
  );
$$;

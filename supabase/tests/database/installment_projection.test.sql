-- Run with `supabase test db` (pgTAP).
--
-- get_projected_installments infers the installment of a card bill that is still
-- open. The predicate is restated inline inside get_dashboard_installments
-- (`is_due_this_month`), so the last assertions pin the two together on the same
-- fixture — that is the guard against the two definitions drifting apart.
BEGIN;
SELECT plan(15);

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-0000000000d1');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);

INSERT INTO accounts (id, name, user_id, slug, type_id) VALUES
  (9501, 'Test Card', '00000000-0000-0000-0000-0000000000d1', 'test-card-proj', 2);

-- Reference month for every assertion below: October 2026.
--
-- OPEN       3 of 10 paid, last one landed in September → owed one in October
-- COMPLETE   all 4 paid                                 → nothing left to project
-- STALLED    last one landed in June                    → too old, not merely late
-- LANDED     the October installment is already stored  → must not be projected twice
INSERT INTO transactions
  (id, unique_hash, account_id, payment_date, purchase_date, payee, amount, status_id, user_id,
   is_installment, installment_number, installment_total)
VALUES
  (9601, 'proj-open-1',     9501, '2026-07-02', '2026-07-02', 'Open Series',     -100, 2, '00000000-0000-0000-0000-0000000000d1', TRUE, 1, 10),
  (9602, 'proj-open-2',     9501, '2026-08-02', '2026-07-02', 'Open Series',     -100, 2, '00000000-0000-0000-0000-0000000000d1', TRUE, 2, 10),
  (9603, 'proj-open-3',     9501, '2026-09-02', '2026-07-02', 'Open Series',     -100, 2, '00000000-0000-0000-0000-0000000000d1', TRUE, 3, 10),

  (9611, 'proj-done-1',     9501, '2026-07-05', '2026-07-05', 'Complete Series', -50,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 1, 4),
  (9612, 'proj-done-2',     9501, '2026-08-05', '2026-07-05', 'Complete Series', -50,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 2, 4),
  (9613, 'proj-done-3',     9501, '2026-09-05', '2026-07-05', 'Complete Series', -50,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 3, 4),
  (9614, 'proj-done-4',     9501, '2026-09-28', '2026-07-05', 'Complete Series', -50,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 4, 4),

  (9621, 'proj-stalled-1',  9501, '2026-05-10', '2026-05-10', 'Stalled Series',  -70,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 1, 6),
  (9622, 'proj-stalled-2',  9501, '2026-06-10', '2026-05-10', 'Stalled Series',  -70,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 2, 6),

  (9631, 'proj-landed-1',   9501, '2026-08-15', '2026-08-15', 'Landed Series',   -90,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 1, 5),
  (9632, 'proj-landed-2',   9501, '2026-09-15', '2026-08-15', 'Landed Series',   -90,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 2, 5),
  (9633, 'proj-landed-3',   9501, '2026-10-15', '2026-08-15', 'Landed Series',   -90,  2, '00000000-0000-0000-0000-0000000000d1', TRUE, 3, 5);

INSERT INTO transaction_splits (transaction_id, category_id, amount)
SELECT id, -4, amount FROM transactions WHERE id BETWEEN 9601 AND 9633;

CREATE TEMP TABLE proj AS
  SELECT * FROM public.get_projected_installments('2026-10-01');

SELECT is((SELECT COUNT(*)::int FROM proj), 1,
  'only the open series is projected');
SELECT is((SELECT payee FROM proj), 'Open Series',
  'the projected series is the one whose last installment predates the month');
SELECT is((SELECT monthly_amount FROM proj), 100.00,
  'projects the series monthly amount');
SELECT is((SELECT paid FROM proj), 3,
  'reports how many installments have actually landed');
SELECT is((SELECT account_id FROM proj), 9501,
  'attributes the projection to the account');

SELECT ok((SELECT COUNT(*) = 0 FROM proj WHERE payee = 'Complete Series'),
  'a finished series is not projected');
SELECT ok((SELECT COUNT(*) = 0 FROM proj WHERE payee = 'Stalled Series'),
  'a stalled series is not projected forever');
SELECT ok((SELECT COUNT(*) = 0 FROM proj WHERE payee = 'Landed Series'),
  'a series whose installment already landed is not projected on top of it');

-- Self-correcting: once the month is over the projection has no reason to exist,
-- because the real installment has landed and moved last_pay into the month.
SELECT is((SELECT COUNT(*)::int FROM public.get_projected_installments('2026-09-01')), 0,
  'September is fully reported, so nothing is projected for it');

-- get_dashboard_monthly_totals cuts the projection to the elapsed-days window:
-- 'Open Series' last landed on 2026-09-02, so it is expected on the 2nd.
SELECT is(
  (public.get_dashboard_monthly_totals('2026-10-01', '2026-10-10')->>'projected_mtd')::numeric,
  100.00,
  'the projection enters the window once its usual day of the month has passed');
SELECT is(
  (public.get_dashboard_monthly_totals('2026-10-01', '2026-10-01')->>'projected_mtd')::numeric,
  0.00,
  'a series expected later in the month is not in the window yet');
SELECT is(
  (public.get_dashboard_monthly_totals('2026-10-01', '2026-10-01')->>'projected_installments')::numeric,
  100.00,
  'the whole-month projection is unaffected by the window');
SELECT ok(
  (public.get_dashboard_monthly_totals('2026-09-01', '2026-10-10')->>'projected_mtd') IS NULL,
  'a closed month has no elapsed-days window to cut');

-- get_dashboard_installments must agree with the standalone function.
SELECT is(
  (SELECT json_array_length(public.get_dashboard_installments('2026-10-01')->'due_this_month')),
  (SELECT COUNT(*)::int FROM proj),
  'the dashboard bucket holds the same number of series as get_projected_installments');
SELECT is(
  (public.get_dashboard_installments('2026-10-01')->>'due_this_month_total')::numeric,
  (SELECT SUM(monthly_amount) FROM proj),
  'the dashboard bucket total matches get_projected_installments');

SELECT * FROM finish();
ROLLBACK;

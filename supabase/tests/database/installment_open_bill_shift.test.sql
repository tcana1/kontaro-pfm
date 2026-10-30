-- Run with `supabase test db` (pgTAP).
--
-- While a card bill is open the bank has not reported this month's installment,
-- so a series' `paid`/`remaining` are frozen at last month. These assertions pin
-- down that such a series is placed in the month it really belongs to:
-- `ending_this_month` includes the ones whose last installment is on the open
-- bill (flagged `projected`), `ending_next_month` the ones one month behind them,
-- and `active` carries the flag the timeline needs.
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-0000000000d2');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);

INSERT INTO accounts (id, name, user_id, slug, type_id) VALUES
  (9701, 'Test Card', '00000000-0000-0000-0000-0000000000d2', 'test-card-shift', 2);

-- Reference month for every assertion below: October 2026.
--
-- CLOSING     2 of 3 paid, last in September  → due, remaining 1 → ends in OCTOBER (projected)
-- NEXT        1 of 3 paid, last in September  → due, remaining 2 → ends in NOVEMBER
-- DONE        2 of 2 paid, last in October    → ended in October, already stored
-- LANDED-1    4 of 5 paid, last in October    → not due, remaining 1 → ends in NOVEMBER
-- LANDED-2    3 of 5 paid, last in October    → not due, remaining 2 → ends later
INSERT INTO transactions
  (id, unique_hash, account_id, payment_date, purchase_date, payee, amount, status_id, user_id,
   is_installment, installment_number, installment_total)
VALUES
  (9801, 'shift-closing-1',  9701, '2026-08-05', '2026-08-05', 'Closing Series',  -60, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 1, 3),
  (9802, 'shift-closing-2',  9701, '2026-09-05', '2026-08-05', 'Closing Series',  -60, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 2, 3),

  (9811, 'shift-next-1',     9701, '2026-09-06', '2026-09-06', 'Next Series',     -80, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 1, 3),

  (9821, 'shift-done-1',     9701, '2026-09-08', '2026-09-08', 'Done Series',     -40, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 1, 2),
  (9822, 'shift-done-2',     9701, '2026-10-08', '2026-09-08', 'Done Series',     -40, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 2, 2),

  (9831, 'shift-landed1-3',  9701, '2026-08-12', '2026-06-12', 'Landed One',      -30, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 3, 5),
  (9832, 'shift-landed1-4',  9701, '2026-10-12', '2026-06-12', 'Landed One',      -30, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 4, 5),

  (9841, 'shift-landed2-2',  9701, '2026-09-14', '2026-08-14', 'Landed Two',      -20, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 2, 5),
  (9842, 'shift-landed2-3',  9701, '2026-10-14', '2026-08-14', 'Landed Two',      -20, 2, '00000000-0000-0000-0000-0000000000d2', TRUE, 3, 5);

INSERT INTO transaction_splits (transaction_id, category_id, amount)
SELECT id, -4, amount FROM transactions WHERE id BETWEEN 9801 AND 9842;

CREATE TEMP TABLE inst AS
  SELECT public.get_dashboard_installments('2026-10-01') AS j;

CREATE TEMP TABLE ending AS
  SELECT e->>'payee' AS payee, (e->>'projected')::boolean AS projected
  FROM inst, json_array_elements(j->'ending_this_month') e;

CREATE TEMP TABLE ending_next AS
  SELECT e->>'payee' AS payee
  FROM inst, json_array_elements(j->'ending_next_month') e;

-- ending_this_month
SELECT is((SELECT COUNT(*)::int FROM ending), 2,
  'two series end this month: the one still on the open bill and the one already stored');
SELECT is((SELECT projected FROM ending WHERE payee = 'Closing Series'), TRUE,
  'a due series with one installment left ends this month, flagged as projected');
SELECT is((SELECT projected FROM ending WHERE payee = 'Done Series'), FALSE,
  'a series whose last installment already landed ends this month, not projected');
SELECT ok((SELECT COUNT(*) = 0 FROM ending WHERE payee IN ('Next Series', 'Landed One', 'Landed Two')),
  'series that still have installments after this month are not ending');

-- ending_next_month
SELECT is((SELECT COUNT(*)::int FROM ending_next), 2,
  'two series end next month');
SELECT ok((SELECT COUNT(*) = 1 FROM ending_next WHERE payee = 'Next Series'),
  'a due series with two installments left ends next month');
SELECT ok((SELECT COUNT(*) = 1 FROM ending_next WHERE payee = 'Landed One'),
  'a series that already landed this month with one left ends next month');
SELECT ok((SELECT COUNT(*) = 0 FROM ending_next WHERE payee IN ('Closing Series', 'Done Series', 'Landed Two')),
  'a series ending this month, or later than next month, is not listed for next month');

-- the timeline needs to know which series are one month behind
SELECT is(
  (SELECT (a->>'is_due_this_month')::boolean
     FROM inst, json_array_elements(j->'active') a WHERE a->>'payee' = 'Next Series'),
  TRUE,
  'an active series whose installment has not landed this month is flagged due');
SELECT is(
  (SELECT (a->>'is_due_this_month')::boolean
     FROM inst, json_array_elements(j->'active') a WHERE a->>'payee' = 'Landed Two'),
  FALSE,
  'an active series whose installment already landed this month is not flagged due');

-- the projected ending must stay in step with the standalone projection
SELECT is(
  (SELECT COUNT(*)::int FROM ending WHERE projected),
  (SELECT COUNT(*)::int FROM public.get_projected_installments('2026-10-01') p WHERE p.installment_total - p.paid = 1),
  'projected endings are exactly the projected series with one installment left');

-- Nothing is stored for a projection: totals and the series resolver are untouched.
SELECT is(
  (SELECT COUNT(*)::int FROM public.resolve_installment_series('2026-11-01') WHERE payee = 'Closing Series' AND final_pay_date IS NOT NULL),
  0,
  'the resolver still reports no final payment for a projected ending');
SELECT is(
  (SELECT COUNT(*)::int FROM transactions WHERE payee = 'Closing Series'),
  2,
  'no projected installment was written to transactions');

-- A past month keeps working: nothing in the fixture is due in August.
SELECT is(
  json_array_length(public.get_dashboard_installments('2026-08-01')->'ending_this_month'),
  0,
  'a month with nothing finishing returns an empty ending list');

SELECT * FROM finish();
ROLLBACK;

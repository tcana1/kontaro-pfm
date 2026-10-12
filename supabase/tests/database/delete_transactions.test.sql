-- Run with `supabase test db` (pgTAP).
BEGIN;
SELECT plan(20);

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);

INSERT INTO accounts (id, name, user_id, slug) VALUES
  (9601, 'Del Checking', '00000000-0000-0000-0000-0000000000c1', 'del-checking'),
  (9602, 'Del Card',     '00000000-0000-0000-0000-0000000000c1', 'del-card'),
  (9603, 'Del Savings',  '00000000-0000-0000-0000-0000000000c1', 'del-savings'),
  (9611, 'Other Checking', '00000000-0000-0000-0000-0000000000c2', 'other-checking');

-- Plain transactions (9701-9703) and another user's row (9799).
INSERT INTO transactions (id, unique_hash, account_id, payment_date, purchase_date, payee, amount, status_id, user_id) VALUES
  (9701, 'del-hash-1', 9601, '2026-10-01', '2026-10-01', 'Plain 1', -10, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9702, 'del-hash-2', 9601, '2026-10-01', '2026-10-01', 'Plain 2', -20, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9703, 'del-hash-3', 9601, '2026-10-01', '2026-10-01', 'Plain 3', -30, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9799, 'del-hash-x', 9611, '2026-10-01', '2026-10-01', 'Not mine', -40, 1, '00000000-0000-0000-0000-0000000000c2');
INSERT INTO transaction_splits (transaction_id, category_id, amount, observation) VALUES
  (9701, -4, -10, ''), (9702, -4, -20, ''), (9703, -4, -30, ''), (9799, -4, -40, '');

-- Two pairs with transfer_link_id, built by the same RPC the app uses.
INSERT INTO transactions (id, unique_hash, account_id, payment_date, purchase_date, payee, amount, status_id, user_id) VALUES
  (9711, 'del-hash-a', 9601, '2026-10-02', '2026-10-02', 'Pair A', -50, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9712, 'del-hash-b', 9601, '2026-10-03', '2026-10-03', 'Pair B', -60, 1, '00000000-0000-0000-0000-0000000000c1');
INSERT INTO transaction_splits (transaction_id, category_id, amount, observation) VALUES
  (9711, -4, -50, ''), (9712, -4, -60, '');
CREATE TEMP TABLE pairs AS
  SELECT 9711 AS a, (convert_transaction_to_linked(9711, '{"to_account_id": 9602, "type": "payment"}'::jsonb)->'linked'->>'id')::int AS a_mirror,
         9712 AS b, (convert_transaction_to_linked(9712, '{"to_account_id": 9602, "type": "payment"}'::jsonb)->'linked'->>'id')::int AS b_mirror;

-- Legacy pair (no transfer_link_id) with a unique mirror: 9721 <-> 9722.
-- Ambiguous legacy leg 9731 has two equally good mirrors, 9732 and 9733.
INSERT INTO transactions (id, unique_hash, account_id, to_account_id, type, payment_date, purchase_date, payee, amount, status_id, user_id) VALUES
  (9721, 'del-hash-l1', 9601, 9603, 'transfer', '2026-10-05', '2026-10-05', 'Transfer to Savings',   -70, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9722, 'del-hash-l2', 9603, 9601, 'transfer', '2026-10-05', '2026-10-05', 'Transfer from Checking', 70, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9731, 'del-hash-m1', 9601, 9603, 'transfer', '2026-10-06', '2026-10-06', 'Transfer to Savings',   -80, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9732, 'del-hash-m2', 9603, 9601, 'transfer', '2026-10-06', '2026-10-06', 'Transfer from Checking', 80, 1, '00000000-0000-0000-0000-0000000000c1'),
  (9733, 'del-hash-m3', 9603, 9601, 'transfer', '2026-10-06', '2026-10-06', 'Transfer from Checking', 80, 1, '00000000-0000-0000-0000-0000000000c1');
INSERT INTO transaction_splits (transaction_id, category_id, amount, observation) VALUES
  (9721, -4, -70, ''), (9722, -4, 70, ''),
  (9731, -4, -80, ''), (9732, -4, 80, ''), (9733, -4, 80, '');

-- ── mixed selection: plain rows, one leg of a pair, both legs of a pair,
-- a legacy pair, an ambiguous legacy leg, and someone else's row ───────────
CREATE TEMP TABLE res AS
  SELECT delete_transactions(ARRAY[
    9701, 9702,
    (SELECT a FROM pairs),
    (SELECT b FROM pairs), (SELECT b_mirror FROM pairs),
    9721,
    9731,
    9799
  ]) AS r;

SELECT is((SELECT count(*)::int FROM transactions WHERE id IN (9701, 9702)), 0, 'plain transactions are deleted');
SELECT is((SELECT count(*)::int FROM transaction_splits WHERE transaction_id IN (9701, 9702)), 0, 'their splits are cascaded away');
SELECT is((SELECT count(*)::int FROM transactions WHERE id IN (SELECT a FROM pairs UNION SELECT a_mirror FROM pairs)), 0, 'selecting one leg deletes the whole linked pair');
SELECT is((SELECT count(*)::int FROM transactions WHERE id IN (SELECT b FROM pairs UNION SELECT b_mirror FROM pairs)), 0, 'selecting both legs deletes the pair once, without error');
SELECT is((SELECT count(*)::int FROM transactions WHERE id IN (9721, 9722)), 0, 'a legacy pair with a unique heuristic mirror is deleted together');
SELECT is((SELECT count(*)::int FROM transactions WHERE id = 9731), 0, 'the selected legacy leg is deleted');
SELECT is((SELECT count(*)::int FROM transactions WHERE id IN (9732, 9733)), 2, 'ambiguous heuristic mirrors are never guessed');
SELECT is((SELECT count(*)::int FROM transactions WHERE id = 9799), 1, 'another user''s transaction is left alone');
SELECT is((SELECT count(*)::int FROM transactions WHERE id = 9703), 1, 'unselected transactions are untouched');

SELECT is((SELECT cardinality(r) FROM res), 9, 'returns every deleted id, partners included, and not the foreign one');
SELECT ok((SELECT r @> ARRAY[(SELECT a_mirror FROM pairs), 9722] FROM res), 'returned ids include the partners that were not selected');
SELECT ok((SELECT NOT (r @> ARRAY[9799]) FROM res), 'returned ids exclude the foreign transaction');

-- ── re-running is a no-op ───────────────────────────────────────────────────
SELECT is(delete_transactions(ARRAY[9701, 9702, 9721]), '{}'::integer[], 'ids that are already gone are ignored');
SELECT is(delete_transactions(ARRAY[]::integer[]), '{}'::integer[], 'empty selection deletes nothing');

-- ── all or nothing: a starting balance row aborts the whole call ────────────
SELECT throws_ok(
  format(
    'SELECT delete_transactions(ARRAY[9703, %s])',
    (SELECT t.id FROM transactions t JOIN transaction_splits s ON s.transaction_id = t.id
      WHERE t.account_id = 9601 AND s.category_id = -3 LIMIT 1)
  ),
  'Starting balance transactions cannot be deleted. To remove the starting balance, set the amount to zero instead.',
  'a starting balance in the selection aborts the call'
);
SELECT is((SELECT count(*)::int FROM transactions WHERE id = 9703), 1, 'nothing else from that selection was deleted');

-- ── auth ────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok('SELECT delete_transactions(ARRAY[9703])', 'Not authenticated', 'refuses unauthenticated callers');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);

SELECT is((SELECT count(*)::int FROM transactions WHERE id = 9703), 1, 'the unauthenticated call deleted nothing');
SELECT ok(has_function_privilege('authenticated', 'delete_transactions(integer[])', 'EXECUTE'), 'authenticated can execute');
SELECT ok(NOT has_function_privilege('anon', 'delete_transactions(integer[])', 'EXECUTE'), 'anon cannot execute');

SELECT * FROM finish();
ROLLBACK;

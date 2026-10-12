-- Run with `supabase test db` (pgTAP).
BEGIN;
SELECT plan(29);

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-0000000000b1');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);

INSERT INTO accounts (id, name, user_id, slug) VALUES
  (9201, 'Acme Checking', '00000000-0000-0000-0000-0000000000b1', 'acme-checking'),
  (9202, 'Acme Card',     '00000000-0000-0000-0000-0000000000b1', 'acme-card'),
  (9203, 'Acme Savings',  '00000000-0000-0000-0000-0000000000b1', 'acme-savings');

INSERT INTO transactions (id, unique_hash, account_id, payment_date, purchase_date, payee, amount, status_id, user_id, statement_identifier, notes) VALUES
  (9301, 'atomic-hash-1', 9201, '2026-10-01', '2026-10-01', 'Card bill', -50.55, 1, '00000000-0000-0000-0000-0000000000b1', 'pluggy:undo-1', 'orig note');
INSERT INTO transaction_splits (transaction_id, category_id, amount, observation) VALUES
  (9301, -4, -50.55, 'orig note');
-- Explicit id above didn't advance the sequence; push it past 9301 so the mirror
-- legs the RPC creates get higher ids (production invariant: original.id < mirror.id).
SELECT setval(pg_get_serial_sequence('transactions', 'id'), 9301, true);

-- ── convert in place: original row BECOMES the primary leg ───────────────────
CREATE TEMP TABLE conv AS
  SELECT convert_transaction_to_linked(9301, '{"to_account_id": 9202, "type": "payment"}'::jsonb) AS r;

SELECT is((SELECT (r->'primary'->>'id')::int FROM conv), 9301, 'convert: primary leg keeps the original id');
SELECT is((SELECT r->'primary'->>'statement_identifier' FROM conv), 'pluggy:undo-1', 'convert: primary keeps statement_identifier');
SELECT is((SELECT r->'primary'->>'unique_hash' FROM conv), 'atomic-hash-1', 'convert: primary keeps unique_hash');
SELECT is((SELECT (r->'original'->>'id')::int FROM conv), 9301, 'convert returns the original snapshot');
SELECT is((SELECT jsonb_array_length(r->'original_splits') FROM conv), 1, 'convert returns the original splits');
SELECT is((SELECT count(*)::int FROM transactions WHERE transfer_link_id = (SELECT (r->'primary'->>'transfer_link_id')::uuid FROM conv)), 2, 'convert: both legs are linked');

-- ── undo restores the original exactly ──────────────────────────────────────
CREATE TEMP TABLE undone AS
  SELECT undo_convert_transaction_to_linked(
    (SELECT (r->'primary'->>'id')::int FROM conv),
    (SELECT r->'original' FROM conv),
    (SELECT r->'original_splits' FROM conv)
  ) AS r;

SELECT is((SELECT type::text FROM transactions WHERE id = 9301), 'transaction', 'undo: type restored');
SELECT is((SELECT to_account_id FROM transactions WHERE id = 9301), NULL, 'undo: to_account_id cleared');
SELECT is((SELECT transfer_link_id FROM transactions WHERE id = 9301), NULL, 'undo: transfer_link_id cleared');
SELECT is((SELECT payee FROM transactions WHERE id = 9301), 'Card bill', 'undo: payee restored');
SELECT is((SELECT statement_identifier FROM transactions WHERE id = 9301), 'pluggy:undo-1', 'undo: statement_identifier intact');
SELECT is((SELECT amount FROM transactions WHERE id = 9301), -50.55::numeric, 'undo: amount restored from splits');
SELECT is((SELECT observation FROM transaction_splits WHERE transaction_id = 9301), 'orig note', 'undo: split restored');
SELECT is((SELECT count(*)::int FROM transactions WHERE transfer_link_id = (SELECT (r->'primary'->>'transfer_link_id')::uuid FROM conv)), 0, 'undo: the pair is gone');

SELECT throws_ok(
  $$SELECT undo_convert_transaction_to_linked(9301, '{"type": "transaction"}'::jsonb, '[{"category_id": -4, "amount": -1}]'::jsonb)$$,
  'Transaction is not a converted pair',
  'undo: refuses a row that is not a converted pair'
);

-- ── update a pair: no doubling, type change, payee regeneration ─────────────
CREATE TEMP TABLE conv2 AS
  SELECT convert_transaction_to_linked(9301, '{"to_account_id": 9202, "type": "payment"}'::jsonb) AS r;

CREATE TEMP TABLE ids AS
  SELECT (r->'primary'->>'id')::int AS p, (r->'linked'->>'id')::int AS l FROM conv2;

-- Saving the form unchanged, notes included (the old client path inserted an extra mirror split here).
SELECT update_linked_transactions((SELECT p FROM ids), '{"notes": "orig note", "amount": -50.55}'::jsonb);

SELECT is((SELECT count(*)::int FROM transaction_splits WHERE transaction_id = (SELECT l FROM ids)), 1, 'update: mirror still has one split');
SELECT is((SELECT amount FROM transactions WHERE id = (SELECT l FROM ids)), 50.55::numeric, 'update: mirror amount is the negation, not doubled');
SELECT is((SELECT amount FROM transactions WHERE id = (SELECT p FROM ids)), -50.55::numeric, 'update: primary amount unchanged');
SELECT is((SELECT payee FROM transactions WHERE id = (SELECT p FROM ids)), 'Payment to Acme Card', 'update: payee untouched when nothing structural changed');

-- Status / ignore flag apply to the edited leg only
SELECT update_linked_transactions((SELECT p FROM ids), '{"status_id": 2, "is_ignored": true}'::jsonb);
SELECT is((SELECT is_ignored FROM transactions WHERE id = (SELECT p FROM ids)), true, 'update: is_ignored applied to the edited leg');
SELECT is((SELECT is_ignored FROM transactions WHERE id = (SELECT l FROM ids)), false, 'update: is_ignored not applied to the mirror');

-- Reconversion Payment -> Transfer
SELECT update_linked_transactions((SELECT p FROM ids), '{"type": "transfer"}'::jsonb);

SELECT is((SELECT type::text FROM transactions WHERE id = (SELECT p FROM ids)), 'transfer', 'reconversion: primary type updated');
SELECT is((SELECT type::text FROM transactions WHERE id = (SELECT l FROM ids)), 'transfer', 'reconversion: mirror type updated');
SELECT is((SELECT payee FROM transactions WHERE id = (SELECT p FROM ids)), 'Transfer to Acme Card', 'reconversion: primary payee regenerated');
SELECT is((SELECT payee FROM transactions WHERE id = (SELECT l FROM ids)), 'Transfer from Acme Checking', 'reconversion: mirror payee regenerated');

-- Editing from the mirror leg, changing the destination account and amount
SELECT update_linked_transactions((SELECT l FROM ids), '{"account_id": 9202, "to_account_id": 9203, "amount": 80}'::jsonb);

SELECT is((SELECT amount FROM transactions WHERE id = (SELECT l FROM ids)), 80::numeric, 'mirror edit: edited leg takes the amount');
SELECT is((SELECT amount FROM transactions WHERE id = (SELECT p FROM ids)), -80::numeric, 'mirror edit: other leg gets the negation');
SELECT is((SELECT account_id FROM transactions WHERE id = (SELECT p FROM ids)), 9203, 'mirror edit: primary leg moved to the new account');

SELECT throws_ok(
  format($$SELECT update_linked_transactions(%s, '{"to_account_id": 9202}'::jsonb)$$, (SELECT l FROM ids)),
  'Source and destination accounts must differ',
  'update: same source and destination rejected'
);

SELECT * FROM finish();
ROLLBACK;

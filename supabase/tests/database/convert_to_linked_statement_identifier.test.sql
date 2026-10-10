-- Run with `supabase test db` (pgTAP).
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-0000000000a1');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

INSERT INTO accounts (id, name, user_id, slug) VALUES
  (9001, 'Test Checking', '00000000-0000-0000-0000-0000000000a1', 'test-checking'),
  (9002, 'Test Card',     '00000000-0000-0000-0000-0000000000a1', 'test-card');

INSERT INTO transactions (id, unique_hash, account_id, payment_date, purchase_date, payee, amount, status_id, user_id, statement_identifier) VALUES
  (9101, 'hash-with-stmt',    9001, '2026-10-01', '2026-10-01', 'Card bill', -100, 1, '00000000-0000-0000-0000-0000000000a1', 'pluggy:abc-123'),
  (9102, 'hash-with-stmt-2',  9001, '2026-10-02', '2026-10-02', 'Move cash', -50,  1, '00000000-0000-0000-0000-0000000000a1', 'pluggy:def-456'),
  (9103, 'hash-without-stmt', 9001, '2026-10-03', '2026-10-03', 'Manual',    -25,  1, '00000000-0000-0000-0000-0000000000a1', NULL);
INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES
  (9101, -4, -100), (9102, -4, -50), (9103, -4, -25);

CREATE TEMP TABLE result_payment  AS SELECT convert_transaction_to_linked(9101, '{"to_account_id": 9002, "type": "payment"}'::jsonb)  AS r;
CREATE TEMP TABLE result_transfer AS SELECT convert_transaction_to_linked(9102, '{"to_account_id": 9002, "type": "transfer"}'::jsonb) AS r;
CREATE TEMP TABLE result_plain    AS SELECT convert_transaction_to_linked(9103, '{"to_account_id": 9002, "type": "payment"}'::jsonb)  AS r;

SELECT is(
  (SELECT r->'primary'->>'statement_identifier' FROM result_payment),
  'pluggy:abc-123',
  'payment: primary leg keeps the original statement_identifier'
);

SELECT is(
  (SELECT statement_identifier FROM transactions WHERE id = (SELECT (r->'linked'->>'id')::int FROM result_payment)),
  NULL,
  'payment: mirror leg gets no statement_identifier'
);

SELECT is(
  (SELECT r->'primary'->>'statement_identifier' FROM result_transfer),
  'pluggy:def-456',
  'transfer: primary leg keeps the original statement_identifier'
);

SELECT is(
  (SELECT r->'linked'->>'statement_identifier' FROM result_transfer),
  NULL,
  'transfer: mirror leg gets no statement_identifier'
);

SELECT is(
  (SELECT r->'primary'->>'statement_identifier' FROM result_plain),
  NULL,
  'original without statement_identifier: primary leg stays NULL'
);

SELECT is(
  (SELECT count(*)::int FROM transactions WHERE id IN (9101, 9102, 9103)),
  0,
  'originals are deleted'
);

-- Same lookup the Pluggy sync uses (get_existing_statement_identifiers) to skip already-imported rows.
SELECT is(
  (SELECT count(*)::int FROM transactions
   WHERE statement_identifier = 'pluggy:abc-123' AND account_id = 9001
     AND user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'sync dedupe lookup still finds the converted transaction'
);

SELECT is(
  (SELECT count(*)::int FROM transactions WHERE statement_identifier = 'pluggy:abc-123'),
  1,
  'exactly one row carries the statement_identifier'
);

SELECT is(
  (SELECT count(*)::int FROM transactions WHERE transfer_link_id = (SELECT (r->'primary'->>'transfer_link_id')::uuid FROM result_payment)),
  2,
  'payment pair is still linked'
);

SELECT is(
  (SELECT (r->'primary'->>'type') FROM result_transfer),
  'transfer',
  'transfer type is preserved'
);

SELECT * FROM finish();
ROLLBACK;

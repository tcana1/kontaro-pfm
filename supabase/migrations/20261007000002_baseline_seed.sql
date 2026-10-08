-- Reference data required for the app to function.
-- Kept separate from the DDL baseline so the schema migration stays pure.
-- Generated from a fully migrated DB; system rows use id <= 0 and user_id NULL.

INSERT INTO "public"."account_types" ("id", "name", "description") VALUES
  (1, 'checking',    'Standard checking account for daily transactions'),
  (2, 'credit_card', 'Credit card account for credit-based purchases'),
  (3, 'tracking',    'Tracking account for monitoring external balances'),
  (4, 'savings',     'Savings account for accumulated funds')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."transaction_statuses" ("id", "name") VALUES
  (1, 'Pending'),
  (2, 'Cleared')
ON CONFLICT ("id") DO NOTHING;

-- Bypass the protect_system_* triggers so the shared system rows can be inserted.
SET session_replication_role = 'replica';

INSERT INTO "public"."category_groups" ("id", "name", "user_id", "emoji", "color", "is_income") VALUES
  (-3, 'Transfer',      NULL, NULL, '#6B7280', false),
  (-2, 'Adjustments',   NULL, NULL, '#6B7280', false),
  (-1, 'Income',        NULL, NULL, '#10B981', true),
  ( 0, 'Uncategorized', NULL, NULL, '#6B7280', false)
ON CONFLICT ("id") DO NOTHING;

-- Only the sentinels hardcoded in business logic are seeded. Everyday categories
-- (Salary, Groceries, ...) are created per-user on demand by
-- create_category_groups_and_categories.
INSERT INTO "public"."categories" ("id", "name", "group_id", "color", "user_id") VALUES
  (-4, 'Transfer/Payment', -3, '#6B7280', NULL),
  (-3, 'Starting Balance', -2, '#3B82F6', NULL),
  (-2, 'Reconciliation',   -2, '#3B82F6', NULL),
  ( 0, 'Uncategorized',     0, '#3B82F6', NULL)
ON CONFLICT ("id") DO NOTHING;

-- create_starting_balance_transaction trigger uses payee_id = -1.
INSERT INTO "public"."payees" ("id", "user_id", "name") VALUES
  (-1, NULL, 'Starting Balance')
ON CONFLICT ("id") DO NOTHING;

SET session_replication_role = 'origin';

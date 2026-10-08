


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgaudit" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






DO $$
DECLARE
    ext_schema text;
BEGIN
    SELECT n.nspname INTO ext_schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'unaccent';

    IF ext_schema IS NULL THEN
        CREATE EXTENSION "unaccent" WITH SCHEMA "public";
    ELSIF ext_schema <> 'public' THEN
        -- CREATE EXTENSION IF NOT EXISTS silently ignores WITH SCHEMA when the
        -- extension already exists (Supabase Cloud installs it in "extensions"),
        -- so expose a public.unaccent(text) that delegates to the real one.
        -- STABLE, not IMMUTABLE: the underlying unaccent(text) reads a dictionary.
        EXECUTE format(
            'CREATE OR REPLACE FUNCTION public.unaccent(text) RETURNS text '
            'LANGUAGE sql STABLE STRICT PARALLEL SAFE '
            'AS $wrap$ SELECT %I.unaccent($1) $wrap$', ext_schema);
    END IF;
END
$$;






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."transaction_type" AS ENUM (
    'expense',
    'income',
    'transfer',
    'payment',
    'transaction'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_generate_account_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- If slug is null or empty, generate one
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := generate_unique_slug(NEW.name, NEW.user_id);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_generate_account_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_reconciliation_difference"("p_account_id" integer, "p_bank_balance" numeric, "p_transaction_ids" integer[]) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_calculated_balance numeric;
  v_difference numeric;
  v_status text;
BEGIN
  -- Calculate the total amount from the provided transactions
  SELECT COALESCE(SUM(ts.amount), 0)
  INTO v_calculated_balance
  FROM transaction_splits ts
  WHERE ts.transaction_id = ANY(p_transaction_ids)
  AND EXISTS (
    SELECT 1 FROM transactions t 
    WHERE t.id = ts.transaction_id 
    AND t.account_id = p_account_id
    AND t.user_id = auth.uid()
  );
  
  -- Calculate difference (positive means calculated > bank, negative means calculated < bank)
  v_difference := v_calculated_balance - p_bank_balance;
  
  -- Determine if there's a significant difference
  IF ABS(v_difference) < 0.01 THEN
    v_status := 'matched';
  ELSE
    v_status := 'mismatch';
  END IF;
  
  -- Return the analysis
  RETURN json_build_object(
    'calculated_balance', v_calculated_balance,
    'bank_balance', p_bank_balance,
    'difference', v_difference,
    'status', v_status,
    'transaction_count', array_length(p_transaction_ids, 1),
    'requires_adjustment', ABS(v_difference) >= 0.01,
    'adjustment_amount', v_difference
  );
END;
$$;


ALTER FUNCTION "public"."check_reconciliation_difference"("p_account_id" integer, "p_bank_balance" numeric, "p_transaction_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_single_starting_balance_per_account"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only check for category_id = -3 (Starting Balance)
  IF NEW.category_id = -3 THEN
    -- Check if this account already has a starting balance transaction
    IF EXISTS (
      SELECT 1 
      FROM transaction_splits s
      INNER JOIN transactions t ON t.id = s.transaction_id
      WHERE t.account_id = (
        SELECT account_id FROM transactions WHERE id = NEW.transaction_id
      )
      AND s.category_id = -3
      AND s.id != COALESCE(NEW.id, -1) -- Exclude current record for updates
    ) THEN
      RAISE EXCEPTION 'Account can only have one starting balance transaction';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_single_starting_balance_per_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."collapse_transactions"("p_base_id" integer, "p_other_ids" integer[], "p_resolved_fields" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count      integer;
  v_final_hash text;
  v_final_stmt text;
BEGIN
  IF p_other_ids IS NULL OR array_length(p_other_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one other transaction is required';
  END IF;

  -- Validate ownership of base and all others
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_base_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_base_id;
  END IF;
  SELECT COUNT(*) INTO v_count
  FROM transactions
  WHERE id = ANY(p_other_ids) AND user_id = auth.uid();
  IF v_count <> array_length(p_other_ids, 1) THEN
    RAISE EXCEPTION 'One or more transactions not found or access denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE id = ANY(p_other_ids)
      AND account_id IS DISTINCT FROM (SELECT account_id FROM transactions WHERE id = p_base_id)
  ) THEN
    RAISE EXCEPTION 'Cannot combine transactions from different accounts';
  END IF;

  -- unique_hash = the most recently created transaction among all participants
  SELECT t.unique_hash INTO v_final_hash
  FROM transactions t
  WHERE t.id = ANY(p_other_ids || ARRAY[p_base_id])
  ORDER BY t.created_at DESC
  LIMIT 1;

  -- A Pluggy id must survive the collapse (any participant, newest first); otherwise keep the base's.
  SELECT COALESCE(
    (SELECT t.statement_identifier FROM transactions t
     WHERE t.id = ANY(p_other_ids || ARRAY[p_base_id]) AND t.statement_identifier LIKE 'pluggy:%'
     ORDER BY t.created_at DESC LIMIT 1),
    (SELECT statement_identifier FROM transactions WHERE id = p_base_id)
  ) INTO v_final_stmt;

  -- Apply resolved fields to the base; its status is left untouched
  UPDATE transactions SET
    payee         = CASE WHEN p_resolved_fields ? 'payee'         THEN p_resolved_fields->>'payee'                ELSE payee         END,
    payment_date  = CASE WHEN p_resolved_fields ? 'payment_date'  THEN (p_resolved_fields->>'payment_date')::date  ELSE payment_date  END,
    purchase_date = CASE WHEN p_resolved_fields ? 'purchase_date' THEN (p_resolved_fields->>'purchase_date')::date ELSE purchase_date END
  WHERE id = p_base_id;

  -- Re-parent ALL splits from the other transactions onto the base.
  -- The base keeps its own splits. trg_update_amount fires and sets
  -- base.amount = SUM of all splits after this + after the DELETEs below.
  UPDATE transaction_splits
    SET transaction_id = p_base_id
    WHERE transaction_id = ANY(p_other_ids);

  -- Dismiss pending match candidates involving the base (stale after collapse)
  UPDATE transaction_match_candidates SET status = 'dismissed'
  WHERE (transaction_a_id = p_base_id OR transaction_b_id = p_base_id)
    AND status = 'pending';

  -- Delete the other transactions (CASCADE removes their remaining match_candidates)
  DELETE FROM transactions WHERE id = ANY(p_other_ids);

  -- Set unique_hash last (others are gone, no duplicate-key risk)
  UPDATE transactions SET unique_hash = v_final_hash, statement_identifier = v_final_stmt WHERE id = p_base_id;
END;
$$;


ALTER FUNCTION "public"."collapse_transactions"("p_base_id" integer, "p_other_ids" integer[], "p_resolved_fields" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_transaction_to_linked"("p_transaction_id" integer, "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current transactions%ROWTYPE;
  v_split_category_id integer;
  v_split_notes text;
  v_account_id integer;
  v_to_account_id integer;
  v_payment_date date;
  v_amount numeric;
  v_notes text;
  v_type text;
  v_category_id integer;
  v_from_name text;
  v_to_name text;
  v_primary_payee text;
  v_linked_payee text;
  v_transfer_link_id uuid := extensions.gen_random_uuid();
  v_base_hash_string text;
  v_primary_hash text;
  v_linked_hash text;
  v_primary jsonb;
  v_linked jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_current
  FROM transactions
  WHERE id = p_transaction_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reconciliation_items ri
    JOIN reconciliations r ON r.id = ri.reconciliation_id
    WHERE ri.transaction_id = p_transaction_id AND r.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot convert reconciled transactions to payments/transfers. Remove from reconciliation first.';
  END IF;

  v_to_account_id := (p_updates->>'to_account_id')::integer;
  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'to_account_id is required';
  END IF;

  v_type := COALESCE(p_updates->>'type', 'payment');
  v_account_id := COALESCE((p_updates->>'account_id')::integer, v_current.account_id);
  v_payment_date := COALESCE((p_updates->>'payment_date')::date, v_current.payment_date);
  v_amount := COALESCE((p_updates->>'amount')::numeric, v_current.amount);

  SELECT s.category_id, s.observation INTO v_split_category_id, v_split_notes
  FROM transaction_splits s
  WHERE s.transaction_id = v_current.id
  ORDER BY s.id
  LIMIT 1;

  v_category_id := COALESCE((p_updates->>'category_id')::integer, v_split_category_id, -4);
  v_notes := COALESCE(p_updates->>'notes', v_split_notes);

  SELECT name INTO v_from_name FROM accounts WHERE id = v_account_id AND user_id = v_user_id;
  SELECT name INTO v_to_name FROM accounts WHERE id = v_to_account_id AND user_id = v_user_id;

  IF v_from_name IS NULL OR v_to_name IS NULL THEN
    RAISE EXCEPTION 'Could not fetch account names for linked transaction payees';
  END IF;

  IF v_type = 'transfer' THEN
    v_primary_payee := 'Transfer to ' || v_to_name;
    v_linked_payee := 'Transfer from ' || v_from_name;
  ELSE
    v_primary_payee := 'Payment to ' || v_to_name;
    v_linked_payee := 'Payment from ' || v_from_name;
  END IF;

  -- Dedupe hash: same recipe as createUniqueTransaction() client-side, built from
  -- the caller-facing payee/amount — not the directional "Payment to X" display
  -- payee below. If it collides with an existing transaction, fail loudly rather
  -- than silently creating a near-duplicate (matches the client's default
  -- force=false behavior; no counter-suffix retry).
  -- NULLIF mirrors the client's `newData.payee || original.payee`: an empty
  -- payee string falls back to the current row's payee (COALESCE alone would
  -- treat '' as a present value and hash differently).
  v_base_hash_string := v_payment_date::text
    || COALESCE(NULLIF(p_updates->>'payee', ''), v_current.payee)
    || to_char(v_amount, 'FM999999999999990.00')
    || v_account_id::text;
  v_primary_hash := encode(extensions.digest(v_base_hash_string, 'sha256'), 'hex');

  -- Exclude the row being converted: it's deleted only at the end of this
  -- function, so it's still present here. When the conversion doesn't change any
  -- hash input (payee/amount/date/account), v_primary_hash equals the original's
  -- own unique_hash — without this guard the conversion would falsely fail as a
  -- duplicate of itself.
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE unique_hash = v_primary_hash AND id <> p_transaction_id
  ) THEN
    RAISE EXCEPTION 'Duplicate transaction found.';
  END IF;

  v_linked_hash := encode(extensions.digest(v_primary_hash || '_linked', 'sha256'), 'hex');

  -- Primary (source-account) leg — status forced to Cleared, matching the app's
  -- existing behavior for created transfer/payment pairs.
  v_primary := create_transaction_with_splits(
    jsonb_build_object(
      'unique_hash', v_primary_hash,
      'account_id', v_account_id,
      'payment_date', v_payment_date,
      'purchase_date', v_payment_date,
      'payee', v_primary_payee,
      'amount', v_amount,
      'status_id', 2,
      'type', v_type,
      'to_account_id', v_to_account_id,
      'transfer_link_id', v_transfer_link_id
    ),
    jsonb_build_array(jsonb_build_object('category_id', v_category_id, 'amount', v_amount, 'observation', v_notes))
  );

  -- Mirror (destination-account) leg — opposite amount, swapped accounts.
  v_linked := create_transaction_with_splits(
    jsonb_build_object(
      'unique_hash', v_linked_hash,
      'account_id', v_to_account_id,
      'payment_date', v_payment_date,
      'purchase_date', v_payment_date,
      'payee', v_linked_payee,
      'amount', -v_amount,
      'status_id', 2,
      'type', v_type,
      'to_account_id', v_account_id,
      'transfer_link_id', v_transfer_link_id
    ),
    jsonb_build_array(jsonb_build_object('category_id', v_category_id, 'amount', -v_amount, 'observation', v_notes))
  );

  -- Pair is committed within this same transaction — if the delete below fails,
  -- everything rolls back atomically (unlike the old multi-round-trip sequence,
  -- which could leave an orphaned pair alongside the still-present original).
  DELETE FROM transactions WHERE id = p_transaction_id AND user_id = v_user_id;

  RETURN jsonb_build_object('primary', v_primary, 'linked', v_linked);
END;
$$;


ALTER FUNCTION "public"."convert_transaction_to_linked"("p_transaction_id" integer, "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_filtered_transactions"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT NULL::"text", "p_amount" numeric DEFAULT NULL::numeric, "p_amount_tolerance" numeric DEFAULT NULL::numeric, "p_categories" integer[] DEFAULT NULL::integer[], "p_tags" integer[] DEFAULT NULL::integer[], "p_accounts" integer[] DEFAULT NULL::integer[], "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_status" "text"[] DEFAULT NULL::"text"[], "p_ignored" boolean DEFAULT NULL::boolean) RETURNS bigint
    LANGUAGE "plpgsql" STABLE
    SET "plan_cache_mode" TO 'force_custom_plan'
    AS $$
DECLARE
  result bigint;
BEGIN
  IF p_search IS NULL AND p_amount IS NULL AND p_categories IS NULL THEN
    SELECT count(*) INTO result
    FROM public.transactions t
    LEFT JOIN public.transaction_statuses st ON st.id = t.status_id
    WHERE (p_user_id IS NULL OR t.user_id = p_user_id)
      AND (p_tags IS NULL OR t.tag_id = ANY(p_tags))
      AND (p_accounts IS NULL OR t.account_id = ANY(p_accounts))
      AND (p_date_from IS NULL OR t.payment_date >= p_date_from)
      AND (p_date_to IS NULL OR t.payment_date <= p_date_to)
      AND (
        (p_status IS NULL AND p_ignored IS NULL)
        OR (p_status IS NOT NULL AND st.name = ANY(p_status))
        OR (p_ignored = true AND t.is_ignored = true)
      );
    RETURN result;
  END IF;

  SELECT count(DISTINCT v.transaction_id) INTO result
  FROM public.v_transaction_splits v
  WHERE (p_user_id IS NULL OR v.user_id = p_user_id)
    AND (
      (p_search IS NULL AND p_amount IS NULL)
      OR (p_search IS NOT NULL AND (
        v.payee_unaccented ILIKE '%' || p_search || '%' OR
        v.observation_unaccented ILIKE '%' || p_search || '%' OR
        v.category_name_unaccented ILIKE '%' || p_search || '%' OR
        v.category_group_name_unaccented ILIKE '%' || p_search || '%' OR
        v.account_name_unaccented ILIKE '%' || p_search || '%' OR
        v.tag_name_unaccented ILIKE '%' || p_search || '%'
      ))
      OR (p_amount IS NOT NULL AND (
        v.amount BETWEEN (p_amount - p_amount_tolerance) AND (p_amount + p_amount_tolerance)
        OR v.amount BETWEEN -(p_amount + p_amount_tolerance) AND -(p_amount - p_amount_tolerance)
        OR v.transaction_amount BETWEEN (p_amount - p_amount_tolerance) AND (p_amount + p_amount_tolerance)
        OR v.transaction_amount BETWEEN -(p_amount + p_amount_tolerance) AND -(p_amount - p_amount_tolerance)
      ))
    )
    AND (p_categories IS NULL OR v.category_id = ANY(p_categories))
    AND (p_tags IS NULL OR v.tag_id = ANY(p_tags))
    AND (p_accounts IS NULL OR v.account_id = ANY(p_accounts))
    AND (p_date_from IS NULL OR v.payment_date >= p_date_from)
    AND (p_date_to IS NULL OR v.payment_date <= p_date_to)
    AND (
      (p_status IS NULL AND p_ignored IS NULL)
      OR (p_status IS NOT NULL AND v.status_name = ANY(p_status))
      OR (p_ignored = true AND v.is_ignored = true)
    );
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."count_filtered_transactions"("p_user_id" "uuid", "p_search" "text", "p_amount" numeric, "p_amount_tolerance" numeric, "p_categories" integer[], "p_tags" integer[], "p_accounts" integer[], "p_date_from" "date", "p_date_to" "date", "p_status" "text"[], "p_ignored" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_category_groups_and_categories"("p_groups" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_group    jsonb;
  v_category jsonb;
  v_group_id integer;
BEGIN
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    IF v_group->>'group_id' IS NOT NULL THEN
      v_group_id := (v_group->>'group_id')::integer;
    ELSE
      INSERT INTO public.category_groups (name, user_id, emoji, color, is_income)
      VALUES (
        v_group->>'name',
        auth.uid(),
        v_group->>'emoji',
        COALESCE(v_group->>'color', '#6B7280'),
        COALESCE((v_group->>'is_income')::boolean, false)
      )
      RETURNING id INTO v_group_id;
    END IF;

    FOR v_category IN SELECT * FROM jsonb_array_elements(COALESCE(v_group->'categories', '[]'::jsonb))
    LOOP
      INSERT INTO public.categories (name, group_id, user_id, color)
      SELECT
        v_category->>'name',
        v_group_id,
        auth.uid(),
        COALESCE(v_category->>'color', '#6B7280')
      -- skip if user already owns this name in this group, OR a system entry exists
      WHERE NOT EXISTS (
        SELECT 1 FROM public.categories
        WHERE name     = v_category->>'name'
          AND group_id = v_group_id
          AND (user_id = auth.uid() OR id <= 0)
      );
    END LOOP;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."create_category_groups_and_categories"("p_groups" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_linked_transactions"("p_transaction_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account_id integer;
  v_to_account_id integer;
  v_payment_date date;
  v_amount numeric;
  v_notes text;
  v_type text;
  v_category_id integer;
  v_from_name text;
  v_to_name text;
  v_primary_payee text;
  v_linked_payee text;
  v_transfer_link_id uuid := extensions.gen_random_uuid();
  v_base_hash_string text;
  v_primary_hash text;
  v_linked_hash text;
  v_primary jsonb;
  v_linked jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_account_id := (p_transaction_data->>'account_id')::integer;
  v_to_account_id := (p_transaction_data->>'to_account_id')::integer;

  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'to_account_id is required';
  END IF;

  v_type := COALESCE(p_transaction_data->>'type', 'payment');
  v_payment_date := (p_transaction_data->>'payment_date')::date;
  v_amount := (p_transaction_data->>'amount')::numeric;
  v_category_id := COALESCE((p_transaction_data->>'category_id')::integer, -4);
  v_notes := p_transaction_data->>'notes';

  SELECT name INTO v_from_name FROM accounts WHERE id = v_account_id AND user_id = v_user_id;
  SELECT name INTO v_to_name FROM accounts WHERE id = v_to_account_id AND user_id = v_user_id;

  IF v_from_name IS NULL OR v_to_name IS NULL THEN
    RAISE EXCEPTION 'Could not fetch account names for linked transaction payees';
  END IF;

  IF v_type = 'transfer' THEN
    v_primary_payee := 'Transfer to ' || v_to_name;
    v_linked_payee := 'Transfer from ' || v_from_name;
  ELSE
    v_primary_payee := 'Payment to ' || v_to_name;
    v_linked_payee := 'Payment from ' || v_from_name;
  END IF;

  -- Hash recipe: payment_date || user-provided payee (or empty) || amount.toFixed(2) || account_id
  -- Matches createUniqueTransaction() client-side for regular transactions.
  v_base_hash_string := v_payment_date::text
    || COALESCE(p_transaction_data->>'payee', '')
    || to_char(v_amount, 'FM999999999999990.00')
    || v_account_id::text;
  v_primary_hash := encode(extensions.digest(v_base_hash_string, 'sha256'), 'hex');

  IF EXISTS (SELECT 1 FROM transactions WHERE unique_hash = v_primary_hash) THEN
    RAISE EXCEPTION 'Duplicate transaction found.';
  END IF;

  v_linked_hash := encode(extensions.digest(v_primary_hash || '_linked', 'sha256'), 'hex');

  v_primary := create_transaction_with_splits(
    jsonb_build_object(
      'unique_hash', v_primary_hash,
      'account_id', v_account_id,
      'payment_date', v_payment_date,
      'purchase_date', v_payment_date,
      'payee', v_primary_payee,
      'amount', v_amount,
      'status_id', 2,
      'type', v_type,
      'to_account_id', v_to_account_id,
      'transfer_link_id', v_transfer_link_id
    ),
    jsonb_build_array(jsonb_build_object('category_id', v_category_id, 'amount', v_amount, 'observation', v_notes))
  );

  v_linked := create_transaction_with_splits(
    jsonb_build_object(
      'unique_hash', v_linked_hash,
      'account_id', v_to_account_id,
      'payment_date', v_payment_date,
      'purchase_date', v_payment_date,
      'payee', v_linked_payee,
      'amount', -v_amount,
      'status_id', 2,
      'type', v_type,
      'to_account_id', v_account_id,
      'transfer_link_id', v_transfer_link_id
    ),
    jsonb_build_array(jsonb_build_object('category_id', v_category_id, 'amount', -v_amount, 'observation', v_notes))
  );

  RETURN jsonb_build_object('primary', v_primary, 'linked', v_linked);
END;
$$;


ALTER FUNCTION "public"."create_linked_transactions"("p_transaction_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_reconciliation"("p_account_id" integer, "p_reconciliation_date" "date", "p_start_date" "date", "p_end_date" "date", "p_bank_balance" numeric, "p_transaction_ids" integer[], "p_notes" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_reconciliation_id integer;
  v_calculated_balance numeric;
  v_status character varying;
  v_difference numeric;
  v_adjustment_transaction_id integer;
  v_new_transaction_count integer;
BEGIN
  -- Verify account ownership
  IF NOT EXISTS (
    SELECT 1 FROM accounts
    WHERE id = p_account_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Account does not belong to current user.';
  END IF;

  -- Verify all transactions belong to the user
  IF EXISTS (
    SELECT 1 FROM unnest(p_transaction_ids) AS tid(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = tid.id AND t.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: Some transactions do not belong to current user.';
  END IF;

  -- Calculate balance from ALL selected transactions (needed to correctly compare against bank_balance)
  SELECT COALESCE(SUM(s.amount), 0)
  INTO v_calculated_balance
  FROM transactions t
  INNER JOIN transaction_splits s ON s.transaction_id = t.id
  WHERE t.id = ANY(p_transaction_ids);

  -- Calculate difference
  v_difference := v_calculated_balance - p_bank_balance;

  -- Determine status (differences < 0.01 are considered matched)
  IF ABS(v_difference) < 0.01 THEN
    v_status := 'matched';
  ELSE
    v_status := 'discrepancy';
  END IF;

  -- Create reconciliation record
  INSERT INTO reconciliations (
    account_id, reconciliation_date, start_date, end_date,
    bank_balance, calculated_balance, status, notes, user_id
  ) VALUES (
    p_account_id, p_reconciliation_date, p_start_date, p_end_date,
    p_bank_balance, v_calculated_balance, v_status, p_notes, auth.uid()
  ) RETURNING id INTO v_reconciliation_id;

  -- Add reconciliation items only for transactions NOT already in an active reconciliation.
  -- This replaces the FOREACH loop and skips already-reconciled transactions, which is the
  -- main performance fix for accounts with thousands of previously reconciled transactions.
  INSERT INTO reconciliation_items (reconciliation_id, transaction_id)
  SELECT v_reconciliation_id, tid
  FROM unnest(p_transaction_ids) AS tid
  WHERE NOT EXISTS (
    SELECT 1
    FROM reconciliation_items ri
    JOIN reconciliations r ON r.id = ri.reconciliation_id
    WHERE ri.transaction_id = tid
      AND r.deleted_at IS NULL
  );
  GET DIAGNOSTICS v_new_transaction_count = ROW_COUNT;

  -- If there's a discrepancy, create adjustment transaction
  IF ABS(v_difference) >= 0.01 THEN
    -- Create the transaction record
    INSERT INTO transactions (
      user_id,
      account_id,
      payment_date,
      purchase_date,
      payee,
      status_id,
      unique_hash
    ) VALUES (
      auth.uid(),
      p_account_id,
      p_reconciliation_date,
      p_reconciliation_date,
      'Reconciliation Adjustment',
      2, -- Cleared status
      'reconciliation_' || v_reconciliation_id || '_' || extract(epoch from now())
    ) RETURNING id INTO v_adjustment_transaction_id;

    -- Create the transaction split record
    INSERT INTO transaction_splits (
      transaction_id,
      amount,
      category_id,
      observation
    ) VALUES (
      v_adjustment_transaction_id,
      -v_difference, -- Negative of difference to balance the reconciliation
      -2, -- System reconciliation category
      'Automatic adjustment to match bank statement during reconciliation'
    );

    -- Add adjustment transaction to reconciliation
    INSERT INTO reconciliation_items (reconciliation_id, transaction_id)
    VALUES (v_reconciliation_id, v_adjustment_transaction_id);

    -- Update reconciliation to matched status
    UPDATE reconciliations
    SET status = 'matched', calculated_balance = p_bank_balance
    WHERE id = v_reconciliation_id;
  END IF;

  -- Return result
  RETURN json_build_object(
    'reconciliation_id', v_reconciliation_id,
    'status', CASE WHEN ABS(v_difference) >= 0.01 THEN 'matched' ELSE v_status END,
    'calculated_balance', CASE WHEN ABS(v_difference) >= 0.01 THEN p_bank_balance ELSE v_calculated_balance END,
    'bank_balance', p_bank_balance,
    'difference', v_difference,
    'transaction_count', v_new_transaction_count,
    'adjustment_transaction_id', v_adjustment_transaction_id
  );
END;
$$;


ALTER FUNCTION "public"."create_reconciliation"("p_account_id" integer, "p_reconciliation_date" "date", "p_start_date" "date", "p_end_date" "date", "p_bank_balance" numeric, "p_transaction_ids" integer[], "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_starting_balance_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_transaction_id INT;
BEGIN
  INSERT INTO transactions (
    user_id, account_id, payment_date, purchase_date,
    payee, payee_id, status_id, unique_hash
  ) VALUES (
    NEW.user_id, NEW.id, NEW.created_at::date, NEW.created_at::date,
    'Starting Balance', -1, 2,
    encode(extensions.digest('starting_balance_' || NEW.id || '_' || extract(epoch from NEW.created_at), 'sha256'), 'hex')
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO transaction_splits (
    transaction_id, amount, category_id, observation
  ) VALUES (
    v_transaction_id, COALESCE(NEW.starting_balance_temp, 0), -3,
    'Account opening balance'
  );

  NEW.starting_balance_temp = NULL;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_starting_balance_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transaction_with_splits"("p_transaction" "jsonb", "p_splits" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tx_id     bigint;
  v_user_id   uuid := auth.uid();
  v_result    jsonb;
  v_status_id int;
  v_type      text;
  v_amount    numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_status_id := COALESCE((p_transaction->>'status_id')::int, 1);
  v_type      := COALESCE(p_transaction->>'type', 'transaction');
  v_amount    := COALESCE(
    (p_transaction->>'amount')::numeric,
    (SELECT COALESCE(SUM((s->>'amount')::numeric), 0) FROM jsonb_array_elements(p_splits) AS s)
  );

  INSERT INTO transactions (
    unique_hash, account_id, payment_date, purchase_date, payee,
    amount, status_id, type,
    installment_number, installment_total,
    to_account_id, tag_id,
    statement_identifier, import_batch_id, transfer_link_id,
    user_id
  )
  VALUES (
    p_transaction->>'unique_hash',
    (p_transaction->>'account_id')::int,
    (p_transaction->>'payment_date')::date,
    COALESCE((p_transaction->>'purchase_date')::date, (p_transaction->>'payment_date')::date),
    p_transaction->>'payee',
    v_amount,
    v_status_id,
    v_type::transaction_type,
    (p_transaction->>'installment_number')::int,
    (p_transaction->>'installment_total')::int,
    (p_transaction->>'to_account_id')::int,
    (p_transaction->>'tag_id')::int,
    p_transaction->>'statement_identifier',
    (p_transaction->>'import_batch_id')::uuid,
    (p_transaction->>'transfer_link_id')::uuid,
    v_user_id
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO transaction_splits (transaction_id, category_id, amount, observation)
  SELECT
    v_tx_id,
    (s->>'category_id')::int,
    (s->>'amount')::numeric,
    COALESCE(s->>'observation', s->>'split_observation', s->>'notes', '')
  FROM jsonb_array_elements(p_splits) AS s;

  SELECT to_jsonb(t) INTO v_result
  FROM transactions t
  WHERE t.id = v_tx_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."create_transaction_with_splits"("p_transaction" "jsonb", "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_account"("p_account_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Account % not found or access denied', p_account_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.account_id = p_account_id
      AND NOT EXISTS (
        SELECT 1 FROM transaction_splits s
        WHERE s.transaction_id = t.id AND s.category_id = -3
      )
  ) THEN
    RAISE EXCEPTION 'Account has transactions. Delete or move them before deleting the account.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM set_config('pfm.deleting_account', 'on', true);

  DELETE FROM transactions WHERE account_id = p_account_id;
  DELETE FROM accounts WHERE id = p_account_id AND user_id = auth.uid();

  PERFORM set_config('pfm.deleting_account', 'off', true);
END;
$$;


ALTER FUNCTION "public"."delete_account"("p_account_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_category_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE transaction_splits
  SET category_id = p_target_category_id
  WHERE category_id = p_item_id;

  IF p_target_category_id = 0 THEN
    DELETE FROM categorization_rules WHERE category_id = p_item_id;
  ELSE
    UPDATE categorization_rules
    SET category_id = p_target_category_id
    WHERE category_id = p_item_id;
  END IF;

  DELETE FROM categories
  WHERE id = p_item_id;
END;
$$;


ALTER FUNCTION "public"."delete_category_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_category_and_transactions"("p_item_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  transaction_ids INT[];
BEGIN
  -- Get transaction IDs associated with the category
  SELECT ARRAY(SELECT transaction_id FROM transaction_splits WHERE category_id = p_item_id) INTO transaction_ids;

  -- Delete transactions (this will cascade delete splits)
  DELETE FROM transactions
  WHERE id = ANY(transaction_ids);

  -- Delete the category
  DELETE FROM categories
  WHERE id = p_item_id;
END;
$$;


ALTER FUNCTION "public"."delete_category_and_transactions"("p_item_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_category_group_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  category_ids INT[];
BEGIN
  SELECT ARRAY(SELECT id FROM categories WHERE group_id = p_item_id) INTO category_ids;

  UPDATE transaction_splits
  SET category_id = p_target_category_id
  WHERE category_id = ANY(category_ids);

  IF p_target_category_id = 0 THEN
    DELETE FROM categorization_rules WHERE category_id = ANY(category_ids);
  ELSE
    UPDATE categorization_rules
    SET category_id = p_target_category_id
    WHERE category_id = ANY(category_ids);
  END IF;

  DELETE FROM categories
  WHERE group_id = p_item_id;

  DELETE FROM category_groups
  WHERE id = p_item_id;
END;
$$;


ALTER FUNCTION "public"."delete_category_group_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_category_group_and_transactions"("p_item_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  category_ids INT[];
  transaction_ids INT[];
BEGIN
  -- Get all category IDs belonging to the group being deleted
  SELECT ARRAY(SELECT id FROM categories WHERE group_id = p_item_id) INTO category_ids;

  -- Get transaction IDs associated with categories in the group
  SELECT ARRAY(SELECT transaction_id FROM transaction_splits WHERE category_id = ANY(category_ids)) INTO transaction_ids;

  -- Delete transactions (this will cascade delete splits)
  DELETE FROM transactions
  WHERE id = ANY(transaction_ids);

  -- Delete categories within the group
  DELETE FROM categories
  WHERE group_id = p_item_id;

  -- Delete the category group
  DELETE FROM category_groups
  WHERE id = p_item_id;
END;
$$;


ALTER FUNCTION "public"."delete_category_group_and_transactions"("p_item_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_reconciliation_adjustment_transaction"("p_transaction_id" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_reconciliation_id integer;
  v_reconciliation_date date;
  v_account_id integer;
  v_is_adjustment boolean := false;
BEGIN
  -- Verify this is a reconciliation adjustment transaction
  IF NOT EXISTS (
    SELECT 1 FROM transaction_splits s
    WHERE s.transaction_id = p_transaction_id 
    AND s.category_id = -2
  ) THEN
    RAISE EXCEPTION 'Transaction ID % is not a reconciliation adjustment transaction.', p_transaction_id;
  END IF;
  
  -- Verify transaction ownership
  IF NOT EXISTS (
    SELECT 1 FROM transactions 
    WHERE id = p_transaction_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Transaction does not belong to current user.';
  END IF;
  
  -- Get the reconciliation that created this adjustment
  SELECT r.id, r.reconciliation_date, r.account_id
  INTO v_reconciliation_id, v_reconciliation_date, v_account_id
  FROM reconciliation_items ri
  INNER JOIN reconciliations r ON ri.reconciliation_id = r.id
  WHERE ri.transaction_id = p_transaction_id
  AND r.deleted_at IS NULL
  AND r.user_id = auth.uid()
  LIMIT 1;
  
  IF v_reconciliation_id IS NULL THEN
    RAISE EXCEPTION 'Could not find active reconciliation for adjustment transaction ID %.', p_transaction_id;
  END IF;
  
  -- Delete the adjustment transaction (this will cascade to splits and reconciliation_items)
  DELETE FROM transactions WHERE id = p_transaction_id;
  
  -- Soft delete the associated reconciliation
  UPDATE reconciliations 
  SET deleted_at = CURRENT_TIMESTAMP, status = 'deleted'
  WHERE id = v_reconciliation_id;
  
  -- Return result with reconciliation info
  RETURN json_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'reconciliation_id', v_reconciliation_id,
    'reconciliation_date', v_reconciliation_date,
    'account_id', v_account_id,
    'message', 'Reconciliation adjustment deleted and reconciliation undone'
  );
END;
$$;


ALTER FUNCTION "public"."delete_reconciliation_adjustment_transaction"("p_transaction_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dismiss_match"("p_match_candidate_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE transaction_match_candidates SET status = 'dismissed'
  WHERE id = p_match_candidate_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match candidate % not found or access denied', p_match_candidate_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."dismiss_match"("p_match_candidate_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."explode_transaction"("p_transaction_id" integer) RETURNS integer[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_txn         transactions%ROWTYPE;
  v_split       transaction_splits%ROWTYPE;
  v_new_id      integer;
  v_result_ids  integer[] := '{}';
  v_split_count integer;
BEGIN
  SELECT * INTO v_txn
  FROM transactions
  WHERE id = p_transaction_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_transaction_id;
  END IF;

  SELECT COUNT(*) INTO v_split_count
  FROM transaction_splits WHERE transaction_id = p_transaction_id;
  IF v_split_count < 2 THEN
    RAISE EXCEPTION 'Transaction % has only % split(s) — nothing to explode', p_transaction_id, v_split_count;
  END IF;

  FOR v_split IN
    SELECT * FROM transaction_splits WHERE transaction_id = p_transaction_id ORDER BY id
  LOOP
    INSERT INTO transactions (
      account_id, payment_date, purchase_date, payee, unique_hash,
      status_id, type, user_id,
      installment_number, installment_total, is_ignored,
      payee_id, tag_id, statement_identifier, import_batch_id
    )
    VALUES (
      v_txn.account_id, v_txn.payment_date, v_txn.purchase_date, v_txn.payee,
      encode(sha256((p_transaction_id::text || '_split_' || v_split.id::text)::bytea), 'hex'),
      v_txn.status_id, v_txn.type, v_txn.user_id,
      v_txn.installment_number, v_txn.installment_total, v_txn.is_ignored,
      v_txn.payee_id, v_txn.tag_id, v_txn.statement_identifier, v_txn.import_batch_id
    )
    RETURNING id INTO v_new_id;

    UPDATE transaction_splits SET transaction_id = v_new_id WHERE id = v_split.id;

    v_result_ids := v_result_ids || v_new_id;
  END LOOP;

  DELETE FROM transactions WHERE id = p_transaction_id;

  RETURN v_result_ids;
END;
$$;


ALTER FUNCTION "public"."explode_transaction"("p_transaction_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_and_mark_matches"("p_account_id" integer, "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tx    record;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized: p_user_id does not match authenticated user';
  END IF;

  FOR v_tx IN
    SELECT id FROM transactions
    WHERE user_id    = p_user_id
      AND account_id = p_account_id
      AND amount IS NOT NULL
      AND amount != 0
  LOOP
    v_total := v_total + find_matches_for_transaction(v_tx.id);
  END LOOP;
  RETURN v_total;
END;
$$;


ALTER FUNCTION "public"."find_and_mark_matches"("p_account_id" integer, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_matches_for_transaction"("p_tx_id" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id          uuid;
  v_account_id       integer;
  v_amount           numeric;
  v_payment_date     date;
  v_purchase_date    date;
  v_stmt_id          text;
  v_import_batch_id  uuid;
  v_win_start        date;
  v_win_end          date;
  v_inserted         integer;
BEGIN
  SELECT user_id, account_id, amount, payment_date, purchase_date,
         statement_identifier, import_batch_id
    INTO v_user_id, v_account_id, v_amount, v_payment_date, v_purchase_date,
         v_stmt_id, v_import_batch_id
  FROM transactions WHERE id = p_tx_id;

  IF NOT FOUND OR v_amount IS NULL OR v_amount = 0 THEN
    RETURN 0;
  END IF;

  -- Guarda: quando chamada via API (não trigger), o chamador deve ser o dono.
  IF auth.uid() IS NOT NULL AND auth.uid() != v_user_id THEN
    RETURN 0;
  END IF;

  v_win_start := LEAST(v_payment_date, v_purchase_date) - 3;
  v_win_end   := GREATEST(v_payment_date, v_purchase_date) + 3;

  WITH candidate_pairs AS (
    SELECT
      LEAST(p_tx_id, b.id)    AS tx_a_id,
      GREATEST(p_tx_id, b.id) AS tx_b_id,
      CASE
        WHEN b.amount = v_amount                                                                  THEN 0.60
        WHEN ABS(v_amount - b.amount) / NULLIF(ABS(GREATEST(v_amount, b.amount)), 0) < 0.01     THEN 0.54
        WHEN ABS(v_amount - b.amount) / NULLIF(ABS(GREATEST(v_amount, b.amount)), 0) < 0.05     THEN 0.42
        ELSE 0.0
      END
      +
      CASE LEAST(
        ABS(v_payment_date  - b.payment_date),
        ABS(v_payment_date  - b.purchase_date),
        ABS(v_purchase_date - b.payment_date),
        ABS(v_purchase_date - b.purchase_date)
      )
        WHEN 0 THEN 0.400
        WHEN 1 THEN 0.360
        WHEN 2 THEN 0.320
        WHEN 3 THEN 0.280
        ELSE 0.0
      END
      AS score
    FROM transactions b
    WHERE b.user_id    = v_user_id
      AND b.account_id = v_account_id
      AND b.id <> p_tx_id
      AND NOT (v_import_batch_id IS NOT NULL AND b.import_batch_id = v_import_batch_id)
      AND NOT (v_stmt_id IS NOT NULL AND b.statement_identifier = v_stmt_id)
      AND (b.payment_date BETWEEN v_win_start AND v_win_end
           OR b.purchase_date BETWEEN v_win_start AND v_win_end)
      AND (b.amount = v_amount
           OR ABS(v_amount - b.amount) / NULLIF(ABS(GREATEST(v_amount, b.amount)), 0) < 0.10)
      AND LEAST(
        ABS(v_payment_date  - b.payment_date),
        ABS(v_payment_date  - b.purchase_date),
        ABS(v_purchase_date - b.payment_date),
        ABS(v_purchase_date - b.purchase_date)
      ) <= 3
  )
  INSERT INTO transaction_match_candidates (user_id, transaction_a_id, transaction_b_id, score, confidence)
  SELECT
    v_user_id,
    tx_a_id,
    tx_b_id,
    score,
    CASE WHEN score >= 0.90 THEN 'high' ELSE 'low' END
  FROM candidate_pairs
  WHERE score >= 0.70
  ON CONFLICT (transaction_a_id, transaction_b_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


ALTER FUNCTION "public"."find_matches_for_transaction"("p_tx_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_slug"("input_text" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    base_slug text;
BEGIN
    -- Convert to lowercase, replace spaces and special characters with hyphens
    base_slug := lower(regexp_replace(public.unaccent(input_text), '[^a-zA-Z0-9]+', '-', 'g'));
    
    -- Remove leading/trailing hyphens
    base_slug := trim(base_slug, '-');
    
    -- Replace multiple consecutive hyphens with single hyphen
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    
    RETURN base_slug;
END;
$$;


ALTER FUNCTION "public"."generate_slug"("input_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_unique_slug"("input_name" "text", "user_uuid" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    base_slug text;
    final_slug text;
    counter integer := 1;
BEGIN
    base_slug := generate_slug(input_name);
    final_slug := base_slug;
    
    -- Check if slug already exists for this user, if so add suffix
    WHILE EXISTS (SELECT 1 FROM accounts WHERE slug = final_slug AND user_id = user_uuid) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$;


ALTER FUNCTION "public"."generate_unique_slug"("input_name" "text", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_balance_from_last_reconciliation"("p_account_id" integer, "p_as_of_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("last_reconciliation_date" "date", "last_reconciliation_balance" numeric, "transactions_since_reconciliation" numeric, "current_calculated_balance" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH last_reconciliation AS (
    SELECT r.reconciliation_date, r.calculated_balance
    FROM reconciliations r
    WHERE r.account_id = p_account_id
    ORDER BY r.reconciliation_date DESC
    LIMIT 1
  ),
  transactions_since AS (
    SELECT
      COALESCE(SUM(s.amount), 0) AS amount_sum
    FROM transactions t
    INNER JOIN transaction_splits s ON s.transaction_id = t.id
    LEFT JOIN last_reconciliation lr ON true
    WHERE t.account_id = p_account_id
      AND t.payment_date > COALESCE(lr.reconciliation_date, '1900-01-01'::date)
      AND t.payment_date <= p_as_of_date
  )
  SELECT
    lr.reconciliation_date,
    COALESCE(lr.calculated_balance, 0::numeric),
    ts.amount_sum,
    COALESCE(lr.calculated_balance, 0::numeric) + ts.amount_sum
  FROM last_reconciliation lr
  CROSS JOIN transactions_since ts;
END;
$$;


ALTER FUNCTION "public"."get_account_balance_from_last_reconciliation"("p_account_id" integer, "p_as_of_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_balances"("account_id_param" integer DEFAULT NULL::integer, "p_today" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("account_id" integer, "account_name" character varying, "account_type_id" integer, "starting_balance" numeric, "cleared_balance" numeric, "pending_balance" numeric, "total_balance" numeric)
    LANGUAGE "sql"
    AS $$
  WITH account_transactions AS (
    SELECT
      a.id as account_id,
      a.name as account_name,
      a.type_id as account_type_id,
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
  )
  SELECT
    account_id::INT,
    account_name::VARCHAR(255),
    account_type_id::INT,
    starting_balance_calc::DECIMAL as starting_balance,
    cleared_balance_calc::DECIMAL as cleared_balance,
    pending_balance_calc::DECIMAL as pending_balance,
    total_balance_calc::DECIMAL as total_balance
  FROM account_transactions
  ORDER BY account_name ASC;
$$;


ALTER FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_analysis_state"("p_month" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_state jsonb;
BEGIN
  SELECT state INTO v_state
  FROM public.analysis_state
  WHERE user_id = auth.uid()
    AND (p_month IS NULL OR month = p_month)
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_state;
END;
$$;


ALTER FUNCTION "public"."get_analysis_state"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_category_ranking"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "sort_by" "text" DEFAULT 'recent_year'::"text", "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    min_year integer;
    max_year integer;
    current_year integer;
    current_month integer;
    result json;
BEGIN
    SELECT EXTRACT(YEAR FROM CURRENT_DATE), EXTRACT(MONTH FROM CURRENT_DATE)
    INTO current_year, current_month;

    SELECT
        MIN(EXTRACT(YEAR FROM t.payment_date)),
        MAX(EXTRACT(YEAR FROM t.payment_date))
    INTO min_year, max_year
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    LEFT OUTER JOIN categories c ON ts.category_id = c.id
    LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= start_date
      AND t.payment_date <= end_date
      AND (cg.is_income = FALSE OR cg.is_income IS NULL)
      AND c.id >= -1
      AND t.is_ignored = FALSE
      AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
      AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
      AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
      AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids));

    IF min_year IS NULL OR max_year IS NULL THEN
        RETURN '[]'::json;
    END IF;

    WITH base_data AS (
        SELECT
            COALESCE(c.name, 'Uncategorized') as category_name,
            COALESCE(cg.emoji, '') as category_emoji,
            COALESCE(c.color, '#9CA3AF') as category_color,
            EXTRACT(YEAR FROM t.payment_date) as transaction_year,
            EXTRACT(MONTH FROM t.payment_date) as transaction_month,
            (ts.amount * -1) as amount
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND (cg.is_income = FALSE OR cg.is_income IS NULL)
          AND c.id >= -1
          AND t.is_ignored = FALSE
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
    ),
    yearly_totals AS (
        SELECT transaction_year, SUM(amount) as year_total FROM base_data GROUP BY transaction_year
    ),
    category_yearly_data AS (
        SELECT
            bd.category_name, bd.category_emoji, bd.category_color,
            bd.transaction_year,
            SUM(bd.amount) as total_amount,
            COUNT(DISTINCT bd.transaction_month) as months_with_activity,
            CASE
                WHEN bd.transaction_year = current_year THEN GREATEST(1, current_month - 1)
                WHEN bd.transaction_year = min_year AND bd.transaction_year = max_year THEN
                    GREATEST(1, EXTRACT(MONTH FROM LEAST(end_date, DATE(max_year::text || '-12-31'))) -
                                EXTRACT(MONTH FROM GREATEST(start_date, DATE(min_year::text || '-01-01'))) + 1)
                WHEN bd.transaction_year = min_year THEN
                    GREATEST(1, 12 - EXTRACT(MONTH FROM GREATEST(start_date, DATE(min_year::text || '-01-01'))) + 1)
                WHEN bd.transaction_year = max_year THEN
                    GREATEST(1, EXTRACT(MONTH FROM LEAST(end_date, DATE(max_year::text || '-12-31'))))
                ELSE 12
            END as months_elapsed,
            yt.year_total
        FROM base_data bd
        JOIN yearly_totals yt ON bd.transaction_year = yt.transaction_year
        GROUP BY bd.category_name, bd.category_emoji, bd.category_color, bd.transaction_year, yt.year_total
    ),
    ranked_categories AS (
        SELECT *,
            ROW_NUMBER() OVER (PARTITION BY transaction_year ORDER BY total_amount DESC) as year_rank,
            ROUND((total_amount / NULLIF(year_total, 0) * 100)::numeric, 1) as percentage,
            ROUND((total_amount / NULLIF(months_elapsed, 0))::numeric, 2) as average_monthly
        FROM category_yearly_data
    ),
    category_summary AS (
        SELECT category_name, category_emoji, category_color,
            json_object_agg(transaction_year::text, json_build_object('rank', year_rank, 'total', total_amount, 'average_monthly', average_monthly, 'percentage', percentage, 'months_elapsed', months_elapsed)) as year_data
        FROM ranked_categories
        GROUP BY category_name, category_emoji, category_color
    ),
    category_sort_values AS (
        SELECT cs.*,
            (SELECT year_rank FROM ranked_categories rc WHERE rc.category_name = cs.category_name AND rc.transaction_year = max_year) as recent_year_rank,
            (SELECT AVG(year_rank) FROM ranked_categories rc WHERE rc.category_name = cs.category_name) as avg_rank,
            (SELECT SUM(total_amount) FROM ranked_categories rc WHERE rc.category_name = cs.category_name) as total_all_years
        FROM category_summary cs
    )
    SELECT COALESCE(json_agg(
        json_build_object('category_name', category_name, 'category_emoji', category_emoji, 'category_color', category_color, 'years', year_data)
        ORDER BY
            CASE sort_by WHEN 'recent_year' THEN recent_year_rank WHEN 'average_rank' THEN avg_rank WHEN 'highest_total' THEN -total_all_years ELSE recent_year_rank END ASC NULLS LAST,
            CASE sort_by WHEN 'alphabetical' THEN category_name ELSE NULL END ASC
    ), '[]'::json) INTO result
    FROM category_sort_values;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_category_ranking"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "sort_by" "text", "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_spending"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE result json;
BEGIN
    SELECT COALESCE(json_agg(json_build_object('date', day, 'daily_total', daily_total) ORDER BY day), '[]'::json) INTO result
    FROM (
        SELECT t.payment_date::text AS day, ROUND(SUM(ts.amount * -1)::numeric, 2) AS daily_total
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND t.is_ignored = FALSE
          AND (cg.is_income = FALSE OR cg.is_income IS NULL)
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY t.payment_date
        HAVING SUM(ts.amount * -1) > 0
    ) daily;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_daily_spending"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_category_trends"("p_month" "date", "p_limit" integer DEFAULT 10) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result         json;
  v_window_start DATE := (p_month - INTERVAL '11 months')::DATE;
  v_window_end   DATE := (p_month + INTERVAL '1 month')::DATE;
BEGIN
  WITH top_cats AS (
    SELECT ts.category_id,
           ROUND(SUM(ts.amount * -1)::numeric, 2) AS current_net
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    JOIN categories c           ON ts.category_id = c.id
    JOIN category_groups cg     ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= p_month AND t.payment_date < v_window_end
      AND (cg.is_income = FALSE OR cg.is_income IS NULL)
      AND ts.category_id > 0
      AND t.is_ignored = FALSE
    GROUP BY ts.category_id
    HAVING SUM(ts.amount * -1) > 0
    ORDER BY current_net DESC
    LIMIT p_limit
  ),
  history AS (
    SELECT ts.category_id,
           TO_CHAR(DATE_TRUNC('month', t.payment_date), 'YYYY-MM') AS month,
           ROUND(SUM(ts.amount * -1)::numeric, 2)                  AS net
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= v_window_start AND t.payment_date < v_window_end
      AND t.is_ignored = FALSE
      AND ts.category_id IN (SELECT category_id FROM top_cats)
    GROUP BY ts.category_id, DATE_TRUNC('month', t.payment_date)
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'category_id',   h.category_id,
      'category_name', c.name,
      'color',         COALESCE(c.color, '#9CA3AF'),
      'month',         h.month,
      'net',           h.net,
      'current_net',   tc.current_net
    )
    ORDER BY tc.current_net DESC, h.month ASC
  ), '[]'::json) INTO result
  FROM history h
  JOIN top_cats tc  ON h.category_id = tc.category_id
  JOIN categories c ON h.category_id = c.id;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_category_trends"("p_month" "date", "p_limit" integer) OWNER TO "postgres";


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
      (s.remaining > 0 AND s.last_pay <  v_stale) AS is_stalled
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
    )
  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_installments"("p_month" "date") OWNER TO "postgres";


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

  RETURN json_build_object(
    'current_net',            COALESCE(v_current, 0),
    'current_gross',          COALESCE(v_gross,   0),
    'current_reimbursements', COALESCE(v_reimb,   0),
    'prior_net',              COALESCE(v_prior,   0),
    'prior_year_net',         COALESCE(v_ly,      0)
  );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_surprises"("p_month" "date", "p_baseline_months" integer DEFAULT 3, "p_min_baseline" numeric DEFAULT 500, "p_threshold" numeric DEFAULT 0.25) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result           json;
  v_end            DATE := (p_month + INTERVAL '1 month')::DATE;
  v_baseline_start DATE := (p_month - (p_baseline_months || ' months')::INTERVAL)::DATE;
BEGIN
  WITH baseline AS (
    SELECT ts.category_id,
           ROUND(SUM(ts.amount * -1)::numeric / p_baseline_months, 2) AS avg_net
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    JOIN categories c           ON ts.category_id = c.id
    JOIN category_groups cg     ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= v_baseline_start AND t.payment_date < p_month
      AND (cg.is_income = FALSE OR cg.is_income IS NULL)
      AND ts.category_id > 0
      AND t.is_ignored = FALSE
    GROUP BY ts.category_id
  ),
  current_spend AS (
    SELECT ts.category_id,
           ROUND(SUM(ts.amount * -1)::numeric, 2) AS net
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    JOIN categories c           ON ts.category_id = c.id
    JOIN category_groups cg     ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= p_month AND t.payment_date < v_end
      AND (cg.is_income = FALSE OR cg.is_income IS NULL)
      AND ts.category_id > 0
      AND t.is_ignored = FALSE
    GROUP BY ts.category_id
  )
  SELECT COALESCE(json_agg(
    json_build_object(
      'category_id',   cs.category_id,
      'category_name', c.name,
      'color',         COALESCE(c.color, '#9CA3AF'),
      'current_net',   cs.net,
      'baseline_net',  b.avg_net,
      'deviation_pct', ROUND(((cs.net - b.avg_net) / NULLIF(b.avg_net, 0))::numeric, 4),
      'tier',          CASE
                         WHEN (cs.net - b.avg_net) / NULLIF(b.avg_net, 0) > 0.50  THEN 'high'
                         WHEN (cs.net - b.avg_net) / NULLIF(b.avg_net, 0) > p_threshold THEN 'medium'
                         WHEN (cs.net - b.avg_net) / NULLIF(b.avg_net, 0) < -p_threshold THEN 'low'
                       END
    )
    ORDER BY ABS(cs.net - b.avg_net) DESC
  ), '[]'::json) INTO result
  FROM current_spend cs
  JOIN baseline b     ON cs.category_id = b.category_id
  JOIN categories c   ON cs.category_id = c.id
  WHERE b.avg_net >= p_min_baseline
    AND ABS((cs.net - b.avg_net) / NULLIF(b.avg_net, 0)) >= p_threshold;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_surprises"("p_month" "date", "p_baseline_months" integer, "p_min_baseline" numeric, "p_threshold" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expense_breakdown"("start_date" "date", "end_date" "date", "input_group_ids" integer[] DEFAULT NULL::integer[], "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS TABLE("label" "text", "value" numeric, "group_id" integer, "color" "text", "unique_months" bigint)
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF input_group_ids IS NULL OR array_length(input_group_ids, 1) = 0 THEN
    RETURN QUERY
    WITH transactions_in_period AS (
        SELECT
            ts.amount,
            c.group_id as category_group_id,
            DATE_TRUNC('month', t.payment_date) as transaction_month
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups as cg on cg.id = c.group_id
        WHERE t.user_id = auth.uid()
            AND (cg.is_income = false or cg.is_income is NULL)
            AND c.id >= -1
            AND t.payment_date >= start_date
            AND t.payment_date <= end_date
            AND t.is_ignored = FALSE
            AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
            AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
            AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
    ),
    monthly_count AS (
        SELECT COUNT(DISTINCT transaction_month) as total_unique_months FROM transactions_in_period
    )
    SELECT
      COALESCE(cg.name, 'Uncategorized')::TEXT AS label,
      (SUM(tip.amount)::DECIMAL) AS value,
      COALESCE(cg.id, 0) AS group_id,
      COALESCE(cg.color, '#9CA3AF')::TEXT,
      mc.total_unique_months AS unique_months
    FROM transactions_in_period tip
    LEFT OUTER JOIN category_groups cg ON tip.category_group_id = cg.id
    CROSS JOIN monthly_count mc
    GROUP BY cg.id, cg.name, cg.color, mc.total_unique_months
    ORDER BY value DESC;
  ELSE
    RETURN QUERY
    WITH transactions_in_period AS (
        SELECT
            ts.amount,
            c.id as category_id,
            DATE_TRUNC('month', t.payment_date) as transaction_month
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups as cg on cg.id = c.group_id
        WHERE t.user_id = auth.uid()
            AND (cg.is_income = false or cg.is_income is NULL)
            AND c.id >= -1
            AND c.group_id = ANY(input_group_ids)
            AND t.payment_date >= start_date
            AND t.payment_date <= end_date
            AND t.is_ignored = FALSE
            AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
            AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
            AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
    ),
    monthly_count AS (
        SELECT COUNT(DISTINCT transaction_month) as total_unique_months FROM transactions_in_period
    )
    SELECT
      COALESCE(c.name, 'Uncategorized')::TEXT AS label,
      (SUM(tip.amount)::DECIMAL) AS value,
      COALESCE(c.id, 0) AS group_id,
      COALESCE(c.color, '#9CA3AF')::TEXT,
      mc.total_unique_months AS unique_months
    FROM transactions_in_period tip
    LEFT OUTER JOIN categories c ON tip.category_id = c.id
    LEFT OUTER JOIN category_groups as cg on cg.id = c.group_id
    CROSS JOIN monthly_count mc
    GROUP BY c.id, c.name, c.color, mc.total_unique_months
    ORDER BY value DESC;
  END IF;
END;$$;


ALTER FUNCTION "public"."get_expense_breakdown"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expense_trends"("start_date" "date", "end_date" "date", "input_group_ids" integer[] DEFAULT NULL::integer[], "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS TABLE("month" "text", "label" "text", "value" numeric, "group_id" integer, "color" "text")
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF input_group_ids IS NULL OR array_length(input_group_ids, 1) = 0 THEN
    RETURN QUERY
    SELECT
      TO_CHAR(t.payment_date, 'YYYY-MM') AS month,
      COALESCE(cg.name, 'Uncategorized')::TEXT AS label,
      (SUM(ts.amount)::DECIMAL) AS value,
      COALESCE(cg.id, 0) AS group_id,
      COALESCE(cg.color, '#9CA3AF')::TEXT
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    LEFT OUTER JOIN categories c ON ts.category_id = c.id
    LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND (cg.is_income = false or cg.is_income is NULL)
      AND c.id >= -1
      AND t.payment_date >= start_date
      AND t.payment_date <= end_date
      AND t.is_ignored = FALSE
      AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
      AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
      AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
    GROUP BY month, cg.id, cg.name, cg.color
    ORDER BY month, value ASC;
  ELSE
    RETURN QUERY
    SELECT
      TO_CHAR(t.payment_date, 'YYYY-MM') AS month,
      COALESCE(c.name, 'Uncategorized')::TEXT AS label,
      (SUM(ts.amount)::DECIMAL) AS value,
      COALESCE(c.id, 0) AS group_id,
      COALESCE(c.color, '#9CA3AF')::TEXT
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    LEFT OUTER JOIN categories c ON ts.category_id = c.id
    LEFT OUTER JOIN category_groups as cg on cg.id = c.group_id
    WHERE t.user_id = auth.uid()
      AND (cg.is_income = false or cg.is_income is NULL)
      AND c.id >= -1
      AND c.group_id = ANY(input_group_ids)
      AND t.payment_date >= start_date
      AND t.payment_date <= end_date
      AND t.is_ignored = FALSE
      AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
      AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
      AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
    GROUP BY month, c.id, c.name, c.color
    ORDER BY month, value ASC;
  END IF;
END;$$;


ALTER FUNCTION "public"."get_expense_trends"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_income_vs_expenses"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$BEGIN
  RETURN json_build_object(
    'income', (
      SELECT COALESCE(json_agg(i), '[]')
      FROM (
        SELECT
          COALESCE(cg.name, 'Uncategorized') as group_name,
          COALESCE(cg.emoji, '') as group_emoji,
          COALESCE(cg.color, '#9CA3AF') as group_color,
          COALESCE(c.name, 'Uncategorized') as category_name,
          COALESCE(c.color, '#9CA3AF') as category_color,
          SUM(ts.amount) as total_amount
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND cg.is_income = TRUE
          AND c.id >= -1
          AND t.is_ignored = FALSE
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY cg.name, cg.emoji, cg.color, c.name, c.color
      ) i
    ),
    'expenses', (
      SELECT COALESCE(json_agg(e), '[]')
      FROM (
        SELECT
          COALESCE(cg.name, 'Uncategorized') as group_name,
          COALESCE(cg.emoji, '') as group_emoji,
          COALESCE(cg.color, '#9CA3AF') as group_color,
          COALESCE(c.name, 'Uncategorized') as category_name,
          COALESCE(c.color, '#9CA3AF') as category_color,
          (SUM(ts.amount) * -1) as total_amount
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND (cg.is_income = FALSE or cg.is_income is NULL)
          AND c.id >= -1
          AND t.is_ignored = FALSE
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY cg.name, cg.emoji, cg.color, c.name, c.color
      ) e
    )
  );
END;$$;


ALTER FUNCTION "public"."get_income_vs_expenses"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_income_vs_expenses_multi_year"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    min_year integer;
    max_year integer;
    result json;
BEGIN
    SELECT
        MIN(EXTRACT(YEAR FROM t.payment_date)),
        MAX(EXTRACT(YEAR FROM t.payment_date))
    INTO min_year, max_year
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    LEFT OUTER JOIN categories c ON ts.category_id = c.id
    LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
    WHERE t.user_id = auth.uid()
      AND t.payment_date >= start_date
      AND t.payment_date <= end_date
      AND c.id >= -1
      AND t.is_ignored = FALSE
      AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
      AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
      AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
      AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids));

    IF min_year IS NULL OR max_year IS NULL THEN
        RETURN json_build_object('income', '[]'::json, 'expenses', '[]'::json);
    END IF;

    WITH base_data AS (
        SELECT
            COALESCE(cg.name, 'Uncategorized') as group_name,
            COALESCE(cg.emoji, '') as group_emoji,
            COALESCE(cg.color, '#9CA3AF') as group_color,
            COALESCE(c.name, 'Uncategorized') as category_name,
            COALESCE(c.color, '#9CA3AF') as category_color,
            EXTRACT(YEAR FROM t.payment_date) as transaction_year,
            ts.amount,
            CASE WHEN cg.is_income = TRUE THEN 'income' ELSE 'expense' END as transaction_type
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND c.id >= -1
          AND t.is_ignored = FALSE
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
    ),
    yearly_totals AS (
        SELECT transaction_year, transaction_type,
            SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE amount * -1 END) as year_total
        FROM base_data GROUP BY transaction_year, transaction_type
    ),
    group_category_yearly AS (
        SELECT bd.group_name, bd.group_emoji, bd.group_color, bd.category_name, bd.category_color,
            bd.transaction_year, bd.transaction_type,
            SUM(CASE WHEN bd.transaction_type = 'income' THEN bd.amount ELSE bd.amount * -1 END) as total_amount,
            yt.year_total
        FROM base_data bd
        JOIN yearly_totals yt ON bd.transaction_year = yt.transaction_year AND bd.transaction_type = yt.transaction_type
        GROUP BY bd.group_name, bd.group_emoji, bd.group_color, bd.category_name, bd.category_color, bd.transaction_year, bd.transaction_type, yt.year_total
    ),
    income_summary AS (
        SELECT group_name, group_emoji, group_color, category_name, category_color,
            json_object_agg(transaction_year::text, json_build_object('total', total_amount, 'percentage', ROUND((total_amount / NULLIF(year_total, 0) * 100)::numeric, 1))) as years
        FROM group_category_yearly WHERE transaction_type = 'income'
        GROUP BY group_name, group_emoji, group_color, category_name, category_color
    ),
    expenses_summary AS (
        SELECT group_name, group_emoji, group_color, category_name, category_color,
            json_object_agg(transaction_year::text, json_build_object('total', total_amount, 'percentage', ROUND((total_amount / NULLIF(year_total, 0) * 100)::numeric, 1))) as years
        FROM group_category_yearly WHERE transaction_type = 'expense'
        GROUP BY group_name, group_emoji, group_color, category_name, category_color
    )
    SELECT json_build_object(
        'income', COALESCE((SELECT json_agg(json_build_object('group_name', group_name, 'group_emoji', group_emoji, 'group_color', group_color, 'category_name', category_name, 'category_color', category_color, 'years', years)) FROM income_summary), '[]'::json),
        'expenses', COALESCE((SELECT json_agg(json_build_object('group_name', group_name, 'group_emoji', group_emoji, 'group_color', group_color, 'category_name', category_name, 'category_color', category_color, 'years', years)) FROM expenses_summary), '[]'::json)
    ) INTO result;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_income_vs_expenses_multi_year"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_insight_run"("p_month" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
           'id', id,
           'month', month,
           'model', model,
           'content', content,
           'created_at', created_at
         )
    INTO v_result
  FROM public.insight_runs
  WHERE user_id = auth.uid()
    AND month = p_month
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_insight_run"("p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_largest_transactions"("p_start" "date", "p_end" "date", "p_limit" integer DEFAULT 20) RETURNS json
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(json_agg(x ORDER BY (x->>'amount')::numeric DESC), '[]'::json) FROM (
    SELECT json_build_object(
             'transaction_id', t.id,
             'payment_date', t.payment_date,
             'payee', t.payee,
             'amount', ROUND(SUM(-ts.amount), 2),
             'categories', string_agg(DISTINCT c.name, ', '),
             'tag', MIN(tg.name),
             'installment', CASE WHEN t.installment_number > 0
                                 THEN t.installment_number || '/' || t.installment_total END,
             'observation', NULLIF(string_agg(DISTINCT NULLIF(ts.observation, ''), ' | '), '')
           ) AS x
    FROM transactions t
    JOIN transaction_splits ts ON ts.transaction_id = t.id
    JOIN categories c          ON c.id = ts.category_id
    LEFT JOIN category_groups cg ON cg.id = c.group_id
    LEFT JOIN tags tg            ON tg.id = t.tag_id
    WHERE t.user_id = (SELECT auth.uid())
      AND t.is_ignored = FALSE
      AND ts.category_id >= 0
      AND ts.amount < 0
      AND COALESCE(cg.is_income, FALSE) = FALSE
      AND t.payment_date >= p_start AND t.payment_date <= p_end
    GROUP BY t.id, t.payment_date, t.payee, t.installment_number, t.installment_total
    ORDER BY SUM(-ts.amount) DESC
    LIMIT GREATEST(LEAST(p_limit, 200), 1)
  ) q;
$$;


ALTER FUNCTION "public"."get_largest_transactions"("p_start" "date", "p_end" "date", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_merchant_scatter"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE result json;
BEGIN
    SELECT COALESCE(json_agg(json_build_object('payee', payee, 'visit_count', visit_count, 'total_spent', total_spent, 'avg_per_visit', avg_per_visit) ORDER BY total_spent DESC), '[]'::json) INTO result
    FROM (
        SELECT
            t.payee,
            COUNT(DISTINCT t.id)::integer AS visit_count,
            ROUND(SUM(ts.amount * -1)::numeric, 2) AS total_spent,
            ROUND((SUM(ts.amount * -1) / COUNT(DISTINCT t.id))::numeric, 2) AS avg_per_visit
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND t.payee IS NOT NULL AND t.payee <> ''
          AND c.id >= -1
          AND t.is_ignored = FALSE
          AND (cg.is_income = FALSE OR cg.is_income IS NULL)
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY t.payee
        HAVING SUM(ts.amount * -1) > 0
        ORDER BY total_spent DESC
        LIMIT 200
    ) subq;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_merchant_scatter"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


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


ALTER FUNCTION "public"."get_month_close"("p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_new_merchants"("p_month" "date", "p_lookback_months" integer DEFAULT 12) RETURNS json
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH b AS (
    SELECT date_trunc('month', p_month)::date AS cur,
           (date_trunc('month', p_month) + INTERVAL '1 month')::date AS nxt,
           (date_trunc('month', p_month) - make_interval(months => GREATEST(p_lookback_months, 1)))::date AS lb
  ),
  m AS (
    SELECT t.payee, c.name AS category, ts.amount, t.installment_number, t.installment_total
    FROM b
    CROSS JOIN transactions t
    JOIN transaction_splits ts ON ts.transaction_id = t.id
    JOIN categories c          ON c.id = ts.category_id
    LEFT JOIN category_groups cg ON cg.id = c.group_id
    WHERE t.user_id = (SELECT auth.uid())
      AND t.is_ignored = FALSE
      AND ts.category_id >= 0
      AND COALESCE(cg.is_income, FALSE) = FALSE
      AND t.payment_date >= b.cur AND t.payment_date < b.nxt
      AND NOT EXISTS (
        SELECT 1 FROM transactions h
        WHERE h.user_id = (SELECT auth.uid())
          AND lower(h.payee) = lower(t.payee)
          AND h.payment_date >= b.lb AND h.payment_date < b.cur
      )
  )
  SELECT COALESCE(json_agg(x ORDER BY (x->>'net')::numeric DESC), '[]'::json) FROM (
    SELECT json_build_object(
             'payee', MIN(payee),
             'net', ROUND(SUM(-amount), 2),
             'count', COUNT(*),
             'categories', string_agg(DISTINCT category, ', '),
             'installment_total', MAX(installment_total) FILTER (WHERE installment_number > 0)
           ) AS x
    FROM m
    GROUP BY lower(payee)
    HAVING SUM(-amount) > 0
  ) q;
$$;


ALTER FUNCTION "public"."get_new_merchants"("p_month" "date", "p_lookback_months" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reconciliation_info_for_adjustment"("p_transaction_id" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_reconciliation_info json;
BEGIN
  -- Check if this is a reconciliation adjustment and get reconciliation details
  SELECT json_build_object(
    'is_adjustment', true,
    'reconciliation_id', r.id,
    'reconciliation_date', r.reconciliation_date,
    'account_id', r.account_id,
    'bank_balance', r.bank_balance,
    'status', r.status
  )
  INTO v_reconciliation_info
  FROM transaction_splits s
  INNER JOIN reconciliation_items ri ON ri.transaction_id = s.transaction_id
  INNER JOIN reconciliations r ON ri.reconciliation_id = r.id
  WHERE s.transaction_id = p_transaction_id 
  AND s.category_id = -2
  AND r.deleted_at IS NULL
  AND r.user_id = auth.uid()
  LIMIT 1;
  
  -- If not found, return that it's not an adjustment
  IF v_reconciliation_info IS NULL THEN
    SELECT json_build_object('is_adjustment', false)
    INTO v_reconciliation_info;
  END IF;
  
  RETURN v_reconciliation_info;
END;
$$;


ALTER FUNCTION "public"."get_reconciliation_info_for_adjustment"("p_transaction_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reimbursements"("p_start" "date", "p_end" "date") RETURNS json
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH r AS (
    SELECT t.payee, c.name AS category, ts.amount
    FROM transactions t
    JOIN transaction_splits ts ON ts.transaction_id = t.id
    JOIN categories c          ON c.id = ts.category_id
    LEFT JOIN category_groups cg ON cg.id = c.group_id
    WHERE t.user_id = (SELECT auth.uid())
      AND t.is_ignored = FALSE
      AND ts.category_id >= 0
      AND ts.amount > 0
      AND COALESCE(cg.is_income, FALSE) = FALSE
      AND t.payment_date >= p_start AND t.payment_date <= p_end
  )
  SELECT json_build_object(
    'total', COALESCE((SELECT ROUND(SUM(amount), 2) FROM r), 0),
    'by_payee', (
      SELECT COALESCE(json_agg(x ORDER BY (x->>'total')::numeric DESC), '[]'::json) FROM (
        SELECT json_build_object('payee', payee, 'total', ROUND(SUM(amount), 2), 'count', COUNT(*),
                                 'categories', string_agg(DISTINCT category, ', ')) AS x
        FROM r GROUP BY payee
      ) q
    ),
    'by_category', (
      SELECT COALESCE(json_agg(x ORDER BY (x->>'total')::numeric DESC), '[]'::json) FROM (
        SELECT json_build_object('category', category, 'total', ROUND(SUM(amount), 2), 'count', COUNT(*)) AS x
        FROM r GROUP BY category
      ) q
    )
  );
$$;


ALTER FUNCTION "public"."get_reimbursements"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_seasonal_pattern"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE result json;
BEGIN
    SELECT COALESCE(json_agg(json_build_object('year', yr, 'month', mo, 'total', total) ORDER BY yr, mo), '[]'::json) INTO result
    FROM (
        SELECT
            EXTRACT(YEAR  FROM t.payment_date)::integer AS yr,
            EXTRACT(MONTH FROM t.payment_date)::integer AS mo,
            ROUND(SUM(ts.amount * -1)::numeric, 2) AS total
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND t.is_ignored = FALSE
          AND (cg.is_income = FALSE OR cg.is_income IS NULL)
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY yr, mo
        HAVING SUM(ts.amount * -1) > 0
    ) seasonal;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_seasonal_pattern"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tag_summary"("p_tag_id" integer) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_total     numeric;
  v_count     bigint;
  v_first     date;
  v_last      date;
  v_breakdown json;
BEGIN
  -- Overall stats (separate query to avoid nested aggregate error)
  SELECT
    COALESCE(ROUND(SUM(ts.amount * -1)::numeric, 2), 0),
    COUNT(DISTINCT t.id),
    MIN(t.payment_date),
    MAX(t.payment_date)
  INTO v_total, v_count, v_first, v_last
  FROM transactions t
  JOIN transaction_splits ts ON t.id = ts.transaction_id
  WHERE t.user_id = auth.uid()
    AND t.tag_id = p_tag_id
    AND t.is_ignored = FALSE;

  -- Category breakdown
  SELECT COALESCE(json_agg(row_data ORDER BY (row_data->>'total')::numeric DESC), '[]'::json)
  INTO v_breakdown
  FROM (
    SELECT json_build_object(
      'category_name',  COALESCE(c.name, 'Uncategorized'),
      'category_color', COALESCE(c.color, '#9CA3AF'),
      'total',          ROUND(SUM(ts2.amount * -1)::numeric, 2),
      'count',          COUNT(DISTINCT t2.id)
    ) AS row_data
    FROM transactions t2
    JOIN transaction_splits ts2 ON t2.id = ts2.transaction_id
    LEFT JOIN categories c ON ts2.category_id = c.id
    WHERE t2.user_id = auth.uid()
      AND t2.tag_id = p_tag_id
      AND t2.is_ignored = FALSE
    GROUP BY c.id, c.name, c.color
  ) sub;

  RETURN json_build_object(
    'total',      v_total,
    'count',      v_count,
    'first_date', v_first,
    'last_date',  v_last,
    'breakdown',  v_breakdown
  );
END;
$$;


ALTER FUNCTION "public"."get_tag_summary"("p_tag_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ticket_size_stats"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE result json;
BEGIN
    WITH per_txn AS (
        SELECT t.id, t.payment_date, ROUND(SUM(ts.amount * -1)::numeric, 2) AS txn_amount
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND t.is_ignored = FALSE
          AND (cg.is_income = FALSE OR cg.is_income IS NULL)
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY t.id, t.payment_date
        HAVING SUM(ts.amount * -1) > 0
    )
    SELECT COALESCE(json_agg(json_build_object('month', month, 'mean_ticket', mean_ticket, 'median_ticket', median_ticket, 'visit_count', visit_count) ORDER BY month), '[]'::json) INTO result
    FROM (
        SELECT
            TO_CHAR(payment_date, 'YYYY-MM') AS month,
            ROUND(AVG(txn_amount)::numeric, 2) AS mean_ticket,
            ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY txn_amount))::numeric, 2) AS median_ticket,
            COUNT(*)::integer AS visit_count
        FROM per_txn
        GROUP BY month
    ) monthly;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_ticket_size_stats"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_merchants_for_category"("input_category_id" integer, "start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "limit_n" integer DEFAULT 5) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    result json;
BEGIN
    SELECT COALESCE(json_agg(
        json_build_object(
            'payee', payee,
            'total_spent', total_spent,
            'visit_count', visit_count
        )
        ORDER BY total_spent DESC
    ), '[]'::json) INTO result
    FROM (
        SELECT
            t.payee,
            ROUND(SUM(ts.amount * -1)::numeric, 2) AS total_spent,
            COUNT(DISTINCT t.id)::integer AS visit_count
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND ts.category_id = input_category_id
          AND t.payee IS NOT NULL
          AND t.payee <> ''
          AND t.is_ignored = FALSE
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
        GROUP BY t.payee
        HAVING SUM(ts.amount * -1) > 0
        ORDER BY total_spent DESC
        LIMIT limit_n
    ) subq;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_top_merchants_for_category"("input_category_id" integer, "start_date" "date", "end_date" "date", "input_account_ids" integer[], "limit_n" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transaction_size_distribution"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "bucket_size" integer DEFAULT 20, "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    result json;
    num_buckets integer := 5;
BEGIN
    SELECT COALESCE(json_agg(json_build_object('bucket_label', bucket_label, 'bucket_min', bucket_min, 'bucket_max', bucket_max, 'count', cnt) ORDER BY bucket_min), '[]'::json) INTO result
    FROM (
        SELECT
            CASE WHEN floor(total_amount / bucket_size)::integer >= num_buckets THEN (num_buckets * bucket_size)::text || '+' ELSE (floor(total_amount / bucket_size)::integer * bucket_size)::text || '–' || ((floor(total_amount / bucket_size)::integer + 1) * bucket_size)::text END AS bucket_label,
            CASE WHEN floor(total_amount / bucket_size)::integer >= num_buckets THEN (num_buckets * bucket_size)::numeric ELSE (floor(total_amount / bucket_size)::integer * bucket_size)::numeric END AS bucket_min,
            CASE WHEN floor(total_amount / bucket_size)::integer >= num_buckets THEN NULL::numeric ELSE ((floor(total_amount / bucket_size)::integer + 1) * bucket_size)::numeric END AS bucket_max,
            COUNT(*)::integer AS cnt
        FROM (
            SELECT ROUND(SUM(ts.amount * -1)::numeric, 2) AS total_amount
            FROM transactions t
            JOIN transaction_splits ts ON t.id = ts.transaction_id
            LEFT OUTER JOIN categories c ON ts.category_id = c.id
            LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
            WHERE t.user_id = auth.uid()
              AND t.payment_date >= start_date
              AND t.payment_date <= end_date
              AND t.is_ignored = FALSE
              AND (cg.is_income = FALSE OR cg.is_income IS NULL)
              AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
              AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
              AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
              AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
            GROUP BY t.id
            HAVING SUM(ts.amount * -1) > 0
        ) per_txn
        GROUP BY bucket_label, bucket_min, bucket_max
    ) buckets;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_transaction_size_distribution"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "bucket_size" integer, "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_overview"() RETURNS json
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT json_build_object(
    'user_id', (SELECT auth.uid()),
    'transactions', (SELECT COUNT(*) FROM transactions WHERE user_id = (SELECT auth.uid())),
    'first_payment_date', (SELECT MIN(payment_date) FROM transactions WHERE user_id = (SELECT auth.uid())),
    'last_payment_date',  (SELECT MAX(payment_date) FROM transactions WHERE user_id = (SELECT auth.uid())),
    'accounts', (SELECT COUNT(*) FROM accounts WHERE user_id = (SELECT auth.uid())),
    'insight_run_months', (
      SELECT COALESCE(json_agg(month ORDER BY month), '[]'::json)
      FROM (SELECT DISTINCT month FROM insight_runs WHERE user_id = (SELECT auth.uid())) q
    ),
    'analysis_state_months', (
      SELECT COALESCE(json_agg(month ORDER BY month), '[]'::json)
      FROM analysis_state WHERE user_id = (SELECT auth.uid())
    )
  );
$$;


ALTER FUNCTION "public"."get_user_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_weekday_heatmap"("start_date" "date", "end_date" "date", "input_account_ids" integer[] DEFAULT NULL::integer[], "input_category_ids" integer[] DEFAULT NULL::integer[], "input_group_ids" integer[] DEFAULT NULL::integer[], "input_excluded_tag_ids" integer[] DEFAULT NULL::integer[]) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE result json;
BEGIN
    SELECT COALESCE(json_agg(json_build_object('month', month_label, 'weekday', weekday_num, 'total', total_amount, 'average', average_amount) ORDER BY month_label ASC, weekday_num ASC), '[]'::json) INTO result
    FROM (
        SELECT
            TO_CHAR(t.payment_date, 'YYYY-MM') AS month_label,
            EXTRACT(ISODOW FROM t.payment_date)::integer AS weekday_num,
            ROUND(SUM(ts.amount * -1)::numeric, 2) AS total_amount,
            ROUND((SUM(ts.amount * -1) / COUNT(DISTINCT t.payment_date))::numeric, 2) AS average_amount
        FROM transactions t
        JOIN transaction_splits ts ON t.id = ts.transaction_id
        LEFT OUTER JOIN categories c ON ts.category_id = c.id
        LEFT OUTER JOIN category_groups cg ON c.group_id = cg.id
        WHERE t.user_id = auth.uid()
          AND t.payment_date >= start_date
          AND t.payment_date <= end_date
          AND c.id >= -1
          AND t.is_ignored = FALSE
          AND (cg.is_income = FALSE OR cg.is_income IS NULL)
          AND (input_account_ids IS NULL OR t.account_id = ANY(input_account_ids))
          AND (input_category_ids IS NULL OR ts.category_id = ANY(input_category_ids))
          AND (input_group_ids IS NULL OR c.group_id = ANY(input_group_ids))
          AND (input_excluded_tag_ids IS NULL OR t.tag_id IS NULL OR t.tag_id != ALL(input_excluded_tag_ids))
        GROUP BY month_label, weekday_num
        HAVING SUM(ts.amount * -1) > 0
    ) subq;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_weekday_heatmap"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_transaction_reconciled"("transaction_id" integer) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM reconciliation_items ri 
    INNER JOIN reconciliations r ON ri.reconciliation_id = r.id
    WHERE ri.transaction_id = $1 
    AND r.deleted_at IS NULL
  );
END;
$_$;


ALTER FUNCTION "public"."is_transaction_reconciled"("transaction_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_winner_created_at  timestamptz;
  v_winner_hash        text;
  v_loser_created_at   timestamptz;
  v_loser_hash         text;
  v_final_hash         text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_winner_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_winner_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_loser_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_loser_id;
  END IF;

  SELECT created_at, unique_hash INTO v_winner_created_at, v_winner_hash
  FROM transactions WHERE id = p_winner_id;

  SELECT created_at, unique_hash INTO v_loser_created_at, v_loser_hash
  FROM transactions WHERE id = p_loser_id;

  v_final_hash := CASE
    WHEN v_loser_created_at > v_winner_created_at THEN v_loser_hash
    ELSE v_winner_hash
  END;

  -- Uses key-existence check (?) so callers can pass null to clear a field.
  UPDATE transactions SET
    payee         = CASE WHEN p_resolved_fields ? 'payee'         THEN p_resolved_fields->>'payee'                ELSE payee         END,
    payment_date  = CASE WHEN p_resolved_fields ? 'payment_date'  THEN (p_resolved_fields->>'payment_date')::date  ELSE payment_date  END,
    purchase_date = CASE WHEN p_resolved_fields ? 'purchase_date' THEN (p_resolved_fields->>'purchase_date')::date ELSE purchase_date END,
    unique_hash   = v_final_hash,
    status_id     = 2  -- Cleared
  WHERE id = p_winner_id;

  -- Apply category and notes to the winner's first split when the user chose the loser's values.
  UPDATE transaction_splits SET
    category_id = CASE WHEN p_resolved_fields ? 'category_id' THEN (p_resolved_fields->>'category_id')::integer ELSE category_id END,
    observation = CASE WHEN p_resolved_fields ? 'notes'       THEN p_resolved_fields->>'notes'                  ELSE observation END
  WHERE id = (
    SELECT id FROM transaction_splits WHERE transaction_id = p_winner_id ORDER BY id LIMIT 1
  );

  UPDATE transaction_match_candidates SET status = 'resolved'
  WHERE id = p_match_candidate_id;

  -- Deleting loser: ON DELETE CASCADE removes splits + any other match_candidates referencing it
  DELETE FROM transactions WHERE id = p_loser_id;
END;
$$;


ALTER FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer, "p_split_source" "text" DEFAULT 'winner'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_winner_created_at  timestamptz;
  v_winner_hash        text;
  v_loser_created_at   timestamptz;
  v_loser_hash         text;
  v_final_hash         text;
  v_winner_stmt        text;
  v_loser_stmt         text;
  v_final_stmt         text;
  v_winner_split_ids   integer[];
  v_loser_amount       numeric;
  v_diff               numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_winner_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_winner_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_loser_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_loser_id;
  END IF;

  IF (SELECT account_id FROM transactions WHERE id = p_winner_id)
     IS DISTINCT FROM (SELECT account_id FROM transactions WHERE id = p_loser_id) THEN
    RAISE EXCEPTION 'Cannot merge transactions from different accounts';
  END IF;

  SELECT created_at, unique_hash INTO v_winner_created_at, v_winner_hash
  FROM transactions WHERE id = p_winner_id;

  SELECT created_at, unique_hash INTO v_loser_created_at, v_loser_hash
  FROM transactions WHERE id = p_loser_id;

  SELECT statement_identifier INTO v_winner_stmt FROM transactions WHERE id = p_winner_id;
  SELECT statement_identifier INTO v_loser_stmt  FROM transactions WHERE id = p_loser_id;

  -- A Pluggy id must survive the merge (whichever side carries it) so the sync can keep
  -- recognising the transaction even after Pluggy mutates its description/date.
  v_final_stmt := CASE
    WHEN v_winner_stmt LIKE 'pluggy:%' THEN v_winner_stmt
    WHEN v_loser_stmt  LIKE 'pluggy:%' THEN v_loser_stmt
    ELSE v_winner_stmt
  END;

  v_final_hash := CASE
    WHEN v_loser_created_at > v_winner_created_at THEN v_loser_hash
    ELSE v_winner_hash
  END;

  -- Apply resolved fields; status is left as the winner's own. unique_hash is set AFTER the loser
  -- is deleted to avoid a transient unique constraint conflict when v_final_hash
  -- equals the loser's current hash.
  UPDATE transactions SET
    payee         = CASE WHEN p_resolved_fields ? 'payee'         THEN p_resolved_fields->>'payee'                ELSE payee         END,
    payment_date  = CASE WHEN p_resolved_fields ? 'payment_date'  THEN (p_resolved_fields->>'payment_date')::date  ELSE payment_date  END,
    purchase_date = CASE WHEN p_resolved_fields ? 'purchase_date' THEN (p_resolved_fields->>'purchase_date')::date ELSE purchase_date END
  WHERE id = p_winner_id;

  IF p_split_source = 'loser' THEN
    -- Save winner's original split IDs before touching anything
    SELECT ARRAY_AGG(id) INTO v_winner_split_ids
      FROM transaction_splits WHERE transaction_id = p_winner_id;

    -- Re-parent loser's splits to winner FIRST so winner.amount goes up, never hits 0.
    UPDATE transaction_splits
      SET transaction_id = p_winner_id
      WHERE transaction_id = p_loser_id;

    -- Now delete winner's original splits
    DELETE FROM transaction_splits WHERE id = ANY(v_winner_split_ids);

  ELSE
    -- 'winner' branch: keep winner's splits, apply resolved category/notes, adjust if multi-split

    UPDATE transaction_splits SET
      category_id = CASE WHEN p_resolved_fields ? 'category_id' THEN (p_resolved_fields->>'category_id')::integer ELSE category_id END,
      observation = CASE WHEN p_resolved_fields ? 'notes'       THEN p_resolved_fields->>'notes'                  ELSE observation END
    WHERE id = (
      SELECT id FROM transaction_splits WHERE transaction_id = p_winner_id ORDER BY id LIMIT 1
    );

    IF (SELECT COUNT(*) FROM transaction_splits WHERE transaction_id = p_winner_id) > 1 THEN
      SELECT amount INTO v_loser_amount FROM transactions WHERE id = p_loser_id;
      v_diff := v_loser_amount - (SELECT amount FROM transactions WHERE id = p_winner_id);

      IF v_diff <> 0 THEN
        UPDATE transaction_splits SET amount = amount + v_diff
        WHERE id = (
          SELECT id FROM transaction_splits WHERE transaction_id = p_winner_id ORDER BY id DESC LIMIT 1
        );
      END IF;
    END IF;
  END IF;

  UPDATE transaction_match_candidates SET status = 'resolved'
  WHERE id = p_match_candidate_id;

  -- Dismiss other pending candidates involving the winner (stale after merge).
  UPDATE transaction_match_candidates SET status = 'dismissed'
  WHERE (transaction_a_id = p_winner_id OR transaction_b_id = p_winner_id)
    AND id != p_match_candidate_id
    AND status = 'pending';

  -- Delete loser: ON DELETE CASCADE removes remaining splits + any match_candidates referencing it.
  DELETE FROM transactions WHERE id = p_loser_id;

  -- Set the final hash only now — loser is gone so no unique constraint conflict.
  UPDATE transactions SET unique_hash = v_final_hash, statement_identifier = v_final_stmt WHERE id = p_winner_id;
END;
$$;


ALTER FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer, "p_split_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_system_category_group_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Prevent UPDATE of system category groups (ID <= 0)
    IF TG_OP = 'UPDATE' AND OLD.id <= 0 THEN
        RAISE EXCEPTION 'System category groups (ID <= 0) cannot be modified';
    END IF;
    
    -- Prevent DELETE of system category groups (ID <= 0)
    IF TG_OP = 'DELETE' AND OLD.id <= 0 THEN
        RAISE EXCEPTION 'System category groups (ID <= 0) cannot be deleted';
    END IF;
    
    -- For INSERT, prevent creating category groups with system IDs
    IF TG_OP = 'INSERT' AND NEW.id <= 0 THEN
        RAISE EXCEPTION 'Cannot create category groups with system IDs (ID <= 0)';
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."prevent_system_category_group_modification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_system_category_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Prevent UPDATE of system categories (ID <= 0)
    IF TG_OP = 'UPDATE' AND OLD.id <= 0 THEN
        RAISE EXCEPTION 'System categories (ID <= 0) cannot be modified';
    END IF;
    
    -- Prevent DELETE of system categories (ID <= 0)  
    IF TG_OP = 'DELETE' AND OLD.id <= 0 THEN
        RAISE EXCEPTION 'System categories (ID <= 0) cannot be deleted';
    END IF;
    
    -- For INSERT, prevent creating categories with system IDs
    IF TG_OP = 'INSERT' AND NEW.id <= 0 THEN
        RAISE EXCEPTION 'Cannot create categories with system IDs (ID <= 0)';
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."prevent_system_category_modification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_system_record_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF OLD.id <= 0 THEN
        RAISE EXCEPTION 'Cannot delete system record with ID <= 0 (ID: %)', OLD.id;
    END IF;
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_system_record_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_reconciled_transactions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Check if the transaction is reconciled (and not soft-deleted)
  IF EXISTS (
    SELECT 1 FROM reconciliation_items ri 
    INNER JOIN reconciliations r ON ri.reconciliation_id = r.id
    WHERE ri.transaction_id = OLD.id 
    AND r.deleted_at IS NULL
  ) THEN
    -- Check if protected fields are being modified
    
    -- Amount protection
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'Cannot modify amount on reconciled transaction (ID: %). Transaction is part of a completed reconciliation. Remove from reconciliation to edit.', OLD.id;
    END IF;
    
    -- Account ID protection
    IF OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Cannot change account on reconciled transaction (ID: %). Transaction is part of a completed reconciliation. Remove from reconciliation to edit.', OLD.id;
    END IF;
    
    -- Payment date protection
    IF OLD.payment_date IS DISTINCT FROM NEW.payment_date THEN
      RAISE EXCEPTION 'Cannot modify payment date on reconciled transaction (ID: %). Transaction is part of a completed reconciliation. Remove from reconciliation to edit.', OLD.id;
    END IF;
    
    -- Purchase date protection
    IF OLD.purchase_date IS DISTINCT FROM NEW.purchase_date THEN
      RAISE EXCEPTION 'Cannot modify purchase date on reconciled transaction (ID: %). Transaction is part of a completed reconciliation. Remove from reconciliation to edit.', OLD.id;
    END IF;
    
    -- Transaction type protection
    IF OLD.type IS DISTINCT FROM NEW.type THEN
      RAISE EXCEPTION 'Cannot change transaction type on reconciled transaction (ID: %). Transaction is part of a completed reconciliation. Remove from reconciliation to edit.', OLD.id;
    END IF;
    
    -- To account ID protection (for transfers)
    IF OLD.to_account_id IS DISTINCT FROM NEW.to_account_id THEN
      RAISE EXCEPTION 'Cannot change transfer destination on reconciled transaction (ID: %). Transaction is part of a completed reconciliation. Remove from reconciliation to edit.', OLD.id;
    END IF;
    
  END IF;
  
  -- If we get here, the update is allowed
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_reconciled_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_starting_balance_splits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.category_id = -3 AND COALESCE(current_setting('pfm.deleting_account', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Starting balance transaction splits cannot be deleted. To remove the starting balance, set the amount to zero instead.';
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."protect_starting_balance_splits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_starting_balance_transactions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF COALESCE(current_setting('pfm.deleting_account', true), '') <> 'on'
     AND EXISTS (
       SELECT 1 FROM transaction_splits s
       WHERE s.transaction_id = OLD.id
       AND s.category_id = -3
     ) THEN
    RAISE EXCEPTION 'Starting balance transactions cannot be deleted. To remove the starting balance, set the amount to zero instead.';
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."protect_starting_balance_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_transaction_from_all_reconciliations"("p_transaction_id" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_removed_count integer;
BEGIN
  -- Verify transaction ownership
  IF NOT EXISTS (
    SELECT 1 FROM transactions 
    WHERE id = p_transaction_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Transaction does not belong to current user.';
  END IF;
  
  -- Remove the transaction from all reconciliation_items (RLS will ensure only user's reconciliations)
  DELETE FROM reconciliation_items 
  WHERE transaction_id = p_transaction_id;
  
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;
  
  -- Return result
  RETURN json_build_object(
    'success', true,
    'transaction_id', p_transaction_id,
    'removed_count', v_removed_count
  );
END;
$$;


ALTER FUNCTION "public"."remove_transaction_from_all_reconciliations"("p_transaction_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_transaction_from_reconciliation"("p_transaction_id" integer, "p_reconciliation_id" integer) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_removed boolean := false;
BEGIN
  -- Remove the transaction from reconciliation
  DELETE FROM reconciliation_items 
  WHERE transaction_id = p_transaction_id 
  AND reconciliation_id = p_reconciliation_id;
  
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  
  -- Return result
  RETURN json_build_object(
    'success', v_removed > 0,
    'transaction_id', p_transaction_id,
    'reconciliation_id', p_reconciliation_id,
    'removed', v_removed
  );
END;
$$;


ALTER FUNCTION "public"."remove_transaction_from_reconciliation"("p_transaction_id" integer, "p_reconciliation_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_installment_series"("p_as_of" "date") RETURNS TABLE("payee" "text", "account_id" integer, "purchase_date" "date", "installment_total" integer, "paid" integer, "remaining" integer, "monthly_amount" numeric, "start_pay_date" "date", "final_pay_date" "date", "last_pay" "date", "is_complete" boolean)
    LANGUAGE "sql" STABLE
    AS $_$
  WITH base AS (
    SELECT
      t.user_id,
      t.account_id,
      t.payee,
      t.purchase_date,
      t.payment_date,
      t.installment_number           AS n,
      t.installment_total            AS tot,
      ABS(t.amount)                  AS amt,
      LEFT(
        REGEXP_REPLACE(
          REGEXP_REPLACE(LOWER(t.payee), '\s+', ' ', 'g'),
          '\s+(sao paulo|rio de janeiro|[a-z]+( [a-z]+)?)\s+bra$', ''
        ), 18
      )                              AS pn,
      ROUND(ABS(t.amount))::int      AS amtb
    FROM transactions t
    WHERE t.is_installment = TRUE
      AND t.is_ignored = FALSE
      AND t.installment_total IS NOT NULL
      AND t.payment_date < p_as_of
  ),
  lagged AS (
    SELECT b.*,
      LAG(b.n) OVER w AS prev_n
    FROM base b
    WINDOW w AS (
      PARTITION BY b.user_id, b.account_id, b.pn, b.tot, b.amtb
      ORDER BY b.payment_date, b.n
    )
  ),
  seq AS (
    SELECT l.*,
      SUM(CASE WHEN l.prev_n IS NOT NULL AND l.n <= l.prev_n THEN 1 ELSE 0 END) OVER (
        PARTITION BY l.user_id, l.account_id, l.pn, l.tot, l.amtb
        ORDER BY l.payment_date, l.n
        ROWS UNBOUNDED PRECEDING
      ) AS sser
    FROM lagged l
  )
  SELECT
    MAX(s.payee)                                      AS payee,
    s.account_id,
    MIN(s.purchase_date)                              AS purchase_date,
    s.tot                                             AS installment_total,
    MAX(s.n)                                          AS paid,
    s.tot - MAX(s.n)                                  AS remaining,
    ROUND(AVG(s.amt)::numeric, 2)                     AS monthly_amount,
    MIN(s.payment_date) FILTER (WHERE s.n = 1)        AS start_pay_date,
    MAX(s.payment_date) FILTER (WHERE s.n = s.tot)    AS final_pay_date,
    MAX(s.payment_date)                               AS last_pay,
    (MAX(s.n) >= s.tot)                               AS is_complete
  FROM seq s
  GROUP BY s.user_id, s.account_id, s.pn, s.tot, s.amtb, s.sser;
$_$;


ALTER FUNCTION "public"."resolve_installment_series"("p_as_of" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reveal_and_clear_api_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plaintext text;
BEGIN
  SELECT key_plaintext_once INTO v_plaintext
  FROM public.user_api_keys
  WHERE user_id = auth.uid() AND key_plaintext_once IS NOT NULL
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.user_api_keys
    SET key_plaintext_once = NULL
    WHERE user_id = auth.uid();
  END IF;

  RETURN v_plaintext;
END;
$$;


ALTER FUNCTION "public"."reveal_and_clear_api_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rotate_api_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key  text;
  v_hash text;
BEGIN
  v_key  := 'pfm_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(sha256(v_key::bytea), 'hex');

  UPDATE public.user_api_keys
  SET key_hash           = v_hash,
      key_preview        = right(v_key, 8),
      key_plaintext_once = NULL,
      created_at         = now(),
      last_used_at       = NULL,
      revoked_at         = NULL
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO public.user_api_keys (user_id, key_hash, key_preview)
    VALUES (auth.uid(), v_hash, right(v_key, 8));
  END IF;

  RETURN v_key;
END;
$$;


ALTER FUNCTION "public"."rotate_api_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_insight_run"("p_month" "text", "p_content" "text", "p_model" "text" DEFAULT 'agent'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_id      integer;
  v_created timestamptz;
BEGIN
  IF p_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid month format, expected YYYY-MM, got %', p_month;
  END IF;
  IF p_content IS NULL OR p_content = '' THEN
    RAISE EXCEPTION 'content is required';
  END IF;

  INSERT INTO public.insight_runs (month, model, content, user_id)
  VALUES (p_month, COALESCE(NULLIF(p_model, ''), 'agent'), p_content, auth.uid())
  RETURNING id, created_at INTO v_id, v_created;

  RETURN json_build_object('id', v_id, 'month', p_month, 'created_at', v_created);
END;
$_$;


ALTER FUNCTION "public"."save_insight_run"("p_month" "text", "p_content" "text", "p_model" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_analysis_state"("p_month" "date", "p_state" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.analysis_state (month, state, user_id)
  VALUES (p_month, p_state, auth.uid())
  ON CONFLICT (user_id, month)
  DO UPDATE SET state = EXCLUDED.state, created_at = now();
END;
$$;


ALTER FUNCTION "public"."set_analysis_state"("p_month" "date", "p_state" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_auth_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS NULL OR NEW.role = '' THEN
        NEW.role := 'authenticated';
      END IF;
    ELSE
      IF NEW.role IS NULL OR NEW.role = '' THEN
        IF OLD.role IS NOT NULL AND OLD.role <> '' THEN
          NEW.role := OLD.role;
        ELSE
          NEW.role := 'authenticated';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."set_default_auth_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_random_category_color"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    colors TEXT[] := ARRAY['#EF4444', '#F97316', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6','#8B5CF6', '#EC4899', '#F43F5E'];
BEGIN
    IF NEW.color IS NULL THEN
        NEW.color := colors[floor(random() * 10 + 1)];
    END IF;
    RETURN NEW;
 END;
 $$;


ALTER FUNCTION "public"."set_random_category_color"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_reconciliation"("p_reconciliation_id" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE reconciliations
  SET deleted_at = CURRENT_TIMESTAMP, status = 'deleted'
  WHERE id = p_reconciliation_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'not found or access denied');
  END IF;

  RETURN json_build_object(
    'success', true,
    'reconciliation_id', p_reconciliation_id,
    'deleted_at', CURRENT_TIMESTAMP
  );
END;
$$;


ALTER FUNCTION "public"."soft_delete_reconciliation"("p_reconciliation_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_payee_on_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Skip blank payees
  IF NEW.payee IS NULL OR trim(NEW.payee) = '' THEN
    RETURN NEW;
  END IF;

  -- Skip transfers and payments (linked accounts, not real payees)
  IF NEW.type IN ('transfer', 'payment') AND NEW.to_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip rows already assigned to a system payee (id < 0)
  IF NEW.payee_id IS NOT NULL AND NEW.payee_id < 0 THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if payee string hasn't changed (avoid unnecessary work)
  IF TG_OP = 'UPDATE' AND OLD.payee = NEW.payee THEN
    RETURN NEW;
  END IF;

  -- Upsert into payees (safe for concurrent inserts)
  INSERT INTO public.payees (user_id, name)
  VALUES (NEW.user_id, NEW.payee)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Resolve and stamp payee_id onto the row before it lands
  SELECT id INTO NEW.payee_id
  FROM public.payees
  WHERE user_id = NEW.user_id AND name = NEW.payee;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_payee_on_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_find_and_mark_matches"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM find_matches_for_transaction(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_find_and_mark_matches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_transaction_amount"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE transactions 
    SET amount = (
        SELECT COALESCE(SUM(amount), 0) 
        FROM transaction_splits 
        WHERE transaction_id = COALESCE(NEW.transaction_id, OLD.transaction_id)
    )
    WHERE id = COALESCE(NEW.transaction_id, OLD.transaction_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_transaction_amount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_transaction_with_splits"("p_transaction_id" bigint, "p_transaction" "jsonb", "p_splits" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE transactions
  SET
    account_id           = COALESCE((p_transaction->>'account_id')::int,           account_id),
    payment_date         = COALESCE((p_transaction->>'payment_date')::date,        payment_date),
    purchase_date        = COALESCE((p_transaction->>'purchase_date')::date,       purchase_date),
    payee                = COALESCE(p_transaction->>'payee',                       payee),
    amount               = COALESCE(
                             (p_transaction->>'amount')::numeric,
                             (SELECT COALESCE(SUM((s->>'amount')::numeric), 0) FROM jsonb_array_elements(p_splits) AS s)
                           ),
    status_id            = COALESCE((p_transaction->>'status_id')::int,            status_id),
    type                 = COALESCE((p_transaction->>'type')::transaction_type,    type),
    installment_number   = COALESCE((p_transaction->>'installment_number')::int,   installment_number),
    installment_total    = COALESCE((p_transaction->>'installment_total')::int,    installment_total),
    to_account_id        = COALESCE((p_transaction->>'to_account_id')::int,        to_account_id),
    tag_id               = COALESCE((p_transaction->>'tag_id')::int,               tag_id),
    statement_identifier = COALESCE(p_transaction->>'statement_identifier',        statement_identifier),
    import_batch_id      = COALESCE((p_transaction->>'import_batch_id')::uuid,     import_batch_id),
    transfer_link_id     = COALESCE((p_transaction->>'transfer_link_id')::uuid,    transfer_link_id)
  WHERE id = p_transaction_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found or access denied', p_transaction_id;
  END IF;

  DELETE FROM transaction_splits WHERE transaction_id = p_transaction_id;

  INSERT INTO transaction_splits (transaction_id, category_id, amount, observation)
  SELECT
    p_transaction_id,
    (s->>'category_id')::int,
    (s->>'amount')::numeric,
    COALESCE(s->>'observation', s->>'split_observation', s->>'notes', '')
  FROM jsonb_array_elements(p_splits) AS s;

  SELECT to_jsonb(t) INTO v_result
  FROM transactions t
  WHERE t.id = p_transaction_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_transaction_with_splits"("p_transaction_id" bigint, "p_transaction" "jsonb", "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_category_ownership"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_category_id integer;
BEGIN
    IF TG_TABLE_NAME = 'payees' THEN
        v_category_id := NEW.default_category_id;
    ELSE
        v_category_id := NEW.category_id;
    END IF;

    IF v_category_id IS NULL OR v_category_id <= 0 OR (SELECT auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = v_category_id AND c.user_id = (SELECT auth.uid())
    ) THEN
        RAISE EXCEPTION 'Category % does not exist or is not owned by the current user', v_category_id
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_category_ownership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."warn_starting_balance_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Check if this transaction has a starting balance split
  IF EXISTS (
    SELECT 1 FROM transaction_splits s 
    WHERE s.transaction_id = NEW.id 
    AND s.category_id = -3
  ) THEN
    -- Log warning but allow modification
    RAISE NOTICE 'Warning: Modifying a starting balance transaction will affect account balance history.';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."warn_starting_balance_modification"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_import_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" integer NOT NULL,
    "bank" "text" NOT NULL,
    "type" "text" NOT NULL,
    "filename_pattern" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "text_pattern" "text"
);


ALTER TABLE "public"."account_import_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_types" (
    "id" integer NOT NULL,
    "name" character varying(50) NOT NULL,
    "description" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."account_types" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."account_types_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."account_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."account_types_id_seq" OWNED BY "public"."account_types"."id";



CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "user_id" "uuid" NOT NULL,
    "icon" character varying(255) DEFAULT 'ri-bank-line'::character varying,
    "last4" character varying(255),
    "is_active" boolean DEFAULT true,
    "type_id" integer DEFAULT 1 NOT NULL,
    "starting_balance_temp" numeric DEFAULT 0,
    "slug" character varying(255) NOT NULL,
    CONSTRAINT "accounts_slug_not_empty" CHECK ((("slug")::"text" <> ''::"text"))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounts"."type_id" IS 'Foreign key reference to account_types table';



CREATE SEQUENCE IF NOT EXISTS "public"."accounts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."accounts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."accounts_id_seq" OWNED BY "public"."accounts"."id";



CREATE TABLE IF NOT EXISTS "public"."analysis_state" (
    "id" integer NOT NULL,
    "month" "date" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "state" "jsonb" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."analysis_state" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."analysis_state_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."analysis_state_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."analysis_state_id_seq" OWNED BY "public"."analysis_state"."id";



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "group_id" integer NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "color" character varying(255),
    "user_id" "uuid",
    CONSTRAINT "user_id_required_for_positive_id" CHECK ((("id" <= 0) OR ("user_id" IS NOT NULL)))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categories_id_seq" OWNED BY "public"."categories"."id";



CREATE TABLE IF NOT EXISTS "public"."categorization_rules" (
    "id" integer NOT NULL,
    "payee_keyword" character varying(100) NOT NULL,
    "category_id" integer NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."categorization_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."categorization_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."categorization_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."categorization_rules_id_seq" OWNED BY "public"."categorization_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."category_groups" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "user_id" "uuid",
    "emoji" character varying(255),
    "color" character varying(255),
    "is_income" boolean DEFAULT false NOT NULL,
    CONSTRAINT "user_id_required_for_positive_id" CHECK ((("id" <= 0) OR ("user_id" IS NOT NULL)))
);


ALTER TABLE "public"."category_groups" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."category_groups_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."category_groups_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."category_groups_id_seq" OWNED BY "public"."category_groups"."id";



CREATE TABLE IF NOT EXISTS "public"."connector_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "connector_id" "uuid" NOT NULL,
    "pluggy_account_id" "text" NOT NULL,
    "account_id" integer NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."connector_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connector_sync_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "connector_account_id" "uuid" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_error" "text",
    "last_synced_created_at" timestamp with time zone
);


ALTER TABLE "public"."connector_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connectors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'pluggy'::"text" NOT NULL,
    "client_id" "text" NOT NULL,
    "client_secret_enc" "text" NOT NULL,
    "schedule" "text" DEFAULT 'daily'::"text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "import_from" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pluggy_item_id" "text",
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."connectors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" integer,
    "source" "text",
    "transaction_count" integer DEFAULT 0 NOT NULL,
    "inserted_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "total_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "finished_at" timestamp with time zone,
    "file_name" "text",
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "error_text" "text",
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."import_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insight_runs" (
    "id" integer NOT NULL,
    "month" character(7) NOT NULL,
    "model" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."insight_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."insight_runs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."insight_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."insight_runs_id_seq" OWNED BY "public"."insight_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."payees" (
    "id" integer NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "default_category_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payees" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."payees_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."payees_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."payees_id_seq" OWNED BY "public"."payees"."id";



CREATE TABLE IF NOT EXISTS "public"."reconciliation_items" (
    "id" integer NOT NULL,
    "reconciliation_id" integer NOT NULL,
    "transaction_id" integer NOT NULL,
    "reconciled_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."reconciliation_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."reconciliation_items_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reconciliation_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reconciliation_items_id_seq" OWNED BY "public"."reconciliation_items"."id";



CREATE TABLE IF NOT EXISTS "public"."reconciliations" (
    "id" integer NOT NULL,
    "account_id" integer NOT NULL,
    "reconciliation_date" "date" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "bank_balance" numeric NOT NULL,
    "calculated_balance" numeric NOT NULL,
    "status" character varying DEFAULT 'pending'::character varying NOT NULL,
    "reconciliation_type" character varying DEFAULT 'manual'::character varying NOT NULL,
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "deleted_at" timestamp without time zone,
    CONSTRAINT "reconciliations_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('pending'::character varying)::"text", ('matched'::character varying)::"text", ('discrepancy'::character varying)::"text", ('resolved'::character varying)::"text", ('deleted'::character varying)::"text"])))
);


ALTER TABLE "public"."reconciliations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."reconciliations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reconciliations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reconciliations_id_seq" OWNED BY "public"."reconciliations"."id";



CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "locale" "text" DEFAULT 'en-US'::"text" NOT NULL,
    "theme" "text" DEFAULT 'light'::"text" NOT NULL,
    "date_format" "text" DEFAULT 'DD/MMM/YYYY'::"text" NOT NULL,
    "onboarded" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."settings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."settings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."settings_id_seq" OWNED BY "public"."settings"."id";



CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "color" character varying(7) DEFAULT '#6B7280'::character varying NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "archived" boolean DEFAULT false NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tags_id_seq" OWNED BY "public"."tags"."id";



CREATE TABLE IF NOT EXISTS "public"."transaction_match_candidates" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "transaction_a_id" integer NOT NULL,
    "transaction_b_id" integer NOT NULL,
    "score" numeric(4,3) NOT NULL,
    "confidence" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transaction_match_candidates_confidence_check" CHECK (("confidence" = ANY (ARRAY['high'::"text", 'low'::"text"]))),
    CONSTRAINT "transaction_match_candidates_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."transaction_match_candidates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transaction_match_candidates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transaction_match_candidates_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transaction_match_candidates_id_seq" OWNED BY "public"."transaction_match_candidates"."id";



CREATE TABLE IF NOT EXISTS "public"."transaction_splits" (
    "id" integer NOT NULL,
    "transaction_id" integer NOT NULL,
    "category_id" integer DEFAULT 0 NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "observation" "text",
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."transaction_splits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transaction_splits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transaction_splits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transaction_splits_id_seq" OWNED BY "public"."transaction_splits"."id";



CREATE TABLE IF NOT EXISTS "public"."transaction_statuses" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."transaction_statuses" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transaction_statuses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transaction_statuses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transaction_statuses_id_seq" OWNED BY "public"."transaction_statuses"."id";



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" integer NOT NULL,
    "unique_hash" character varying(64) NOT NULL,
    "account_id" integer NOT NULL,
    "payment_date" "date" NOT NULL,
    "purchase_date" "date" NOT NULL,
    "payee" character varying(255) NOT NULL,
    "amount" numeric(10,2),
    "installment_number" integer,
    "installment_total" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "user_id" "uuid" NOT NULL,
    "type" "public"."transaction_type" DEFAULT 'transaction'::"public"."transaction_type" NOT NULL,
    "to_account_id" integer,
    "status_id" integer DEFAULT 1 NOT NULL,
    "is_installment" boolean GENERATED ALWAYS AS (("installment_number" > 0)) STORED,
    "is_ignored" boolean DEFAULT false,
    "payee_id" integer,
    "tag_id" integer,
    "statement_identifier" "text",
    "import_batch_id" "uuid",
    "transfer_link_id" "uuid",
    "notes" "text",
    CONSTRAINT "transactions_status_check" CHECK (("status_id" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."transactions"."type" IS 'Transaction type: transaction, transfer, payment. Simplified from previous income/expense distinction.';



COMMENT ON COLUMN "public"."transactions"."is_ignored" IS 'User preference to ignore transaction in reports while keeping in balance calculations';



CREATE SEQUENCE IF NOT EXISTS "public"."transactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transactions_id_seq" OWNED BY "public"."transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_preview" "text" NOT NULL,
    "key_plaintext_once" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."user_api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_openexchange_keys" (
    "user_id" "uuid" NOT NULL,
    "key_enc" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_openexchange_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_pdf_passwords" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "password_enc" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_pdf_passwords" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_payee_transaction_counts" WITH ("security_invoker"='on') AS
 SELECT "p"."id",
    "p"."name",
    "p"."default_category_id",
    "count"("t"."id") AS "transaction_count"
   FROM ("public"."payees" "p"
     LEFT JOIN "public"."transactions" "t" ON (("t"."payee_id" = "p"."id")))
  WHERE ("p"."id" > 0)
  GROUP BY "p"."id", "p"."name", "p"."default_category_id";


ALTER VIEW "public"."v_payee_transaction_counts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_transaction_splits" WITH ("security_invoker"='on') AS
 SELECT "t"."id" AS "transaction_id",
    "t"."user_id",
    "t"."payment_date",
    "t"."purchase_date",
    "t"."payee",
    "t"."type",
    "t"."to_account_id",
    "t"."is_installment",
    "t"."installment_number",
    "t"."installment_total",
    "s"."id" AS "split_id",
    "s"."amount",
    COALESCE("s"."observation", ''::"text") AS "observation",
    "a"."id" AS "account_id",
    "a"."name" AS "account_name",
    "at"."name" AS "account_type",
    "a"."icon" AS "account_icon",
    "st"."id" AS "status_id",
    "st"."name" AS "status_name",
    "t"."is_ignored",
    "c"."id" AS "category_id",
    "c"."name" AS "category_name",
    "c"."color" AS "category_color",
    "cg"."is_income" AS "category_is_income",
    "cg"."id" AS "category_group_id",
    "cg"."name" AS "category_group_name",
    "cg"."emoji" AS "category_group_emoji",
    "ta"."name" AS "to_account_name",
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM ("public"."reconciliation_items" "ri"
                 JOIN "public"."reconciliations" "r" ON (("ri"."reconciliation_id" = "r"."id")))
              WHERE (("ri"."transaction_id" = "t"."id") AND ("r"."deleted_at" IS NULL)))) THEN true
            ELSE false
        END AS "is_reconciled",
    "t"."amount" AS "transaction_amount",
    "t"."tag_id",
    "tg"."name" AS "tag_name",
    "tg"."color" AS "tag_color",
    "public"."unaccent"(("t"."payee")::"text") AS "payee_unaccented",
    "public"."unaccent"(COALESCE("s"."observation", ''::"text")) AS "observation_unaccented",
    "public"."unaccent"(("a"."name")::"text") AS "account_name_unaccented",
    "public"."unaccent"(("c"."name")::"text") AS "category_name_unaccented",
    "public"."unaccent"(("cg"."name")::"text") AS "category_group_name_unaccented",
    "public"."unaccent"(("tg"."name")::"text") AS "tag_name_unaccented"
   FROM (((((((("public"."transactions" "t"
     LEFT JOIN "public"."transaction_splits" "s" ON (("s"."transaction_id" = "t"."id")))
     LEFT JOIN "public"."accounts" "a" ON (("a"."id" = "t"."account_id")))
     LEFT JOIN "public"."accounts" "ta" ON (("ta"."id" = "t"."to_account_id")))
     LEFT JOIN "public"."account_types" "at" ON (("at"."id" = "a"."type_id")))
     LEFT JOIN "public"."transaction_statuses" "st" ON (("st"."id" = "t"."status_id")))
     LEFT JOIN "public"."categories" "c" ON (("c"."id" = "s"."category_id")))
     LEFT JOIN "public"."category_groups" "cg" ON (("cg"."id" = "c"."group_id")))
     LEFT JOIN "public"."tags" "tg" ON (("tg"."id" = "t"."tag_id")));


ALTER VIEW "public"."v_transaction_splits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."account_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."accounts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."accounts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."analysis_state" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."analysis_state_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."categorization_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."categorization_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."category_groups" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."category_groups_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."insight_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."insight_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."payees" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."payees_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reconciliation_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reconciliation_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reconciliations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reconciliations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."settings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."settings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transaction_match_candidates" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transaction_match_candidates_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transaction_splits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transaction_splits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transaction_statuses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transaction_statuses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."account_import_rules"
    ADD CONSTRAINT "account_import_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_types"
    ADD CONSTRAINT "account_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."account_types"
    ADD CONSTRAINT "account_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_slug_user_id_unique" UNIQUE ("slug", "user_id");



ALTER TABLE ONLY "public"."analysis_state"
    ADD CONSTRAINT "analysis_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analysis_state"
    ADD CONSTRAINT "analysis_state_user_month_unique" UNIQUE ("user_id", "month");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorization_rules"
    ADD CONSTRAINT "categorization_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_groups"
    ADD CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connector_accounts"
    ADD CONSTRAINT "connector_accounts_connector_id_pluggy_account_id_key" UNIQUE ("connector_id", "pluggy_account_id");



ALTER TABLE ONLY "public"."connector_accounts"
    ADD CONSTRAINT "connector_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connector_sync_state"
    ADD CONSTRAINT "connector_sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connector_sync_state"
    ADD CONSTRAINT "connector_sync_state_user_id_connector_account_id_key" UNIQUE ("user_id", "connector_account_id");



ALTER TABLE ONLY "public"."connectors"
    ADD CONSTRAINT "connectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insight_runs"
    ADD CONSTRAINT "insight_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payees"
    ADD CONSTRAINT "payees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payees"
    ADD CONSTRAINT "payees_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."reconciliation_items"
    ADD CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reconciliation_items"
    ADD CONSTRAINT "reconciliation_items_unique" UNIQUE ("reconciliation_id", "transaction_id");



ALTER TABLE ONLY "public"."reconciliations"
    ADD CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_match_candidates"
    ADD CONSTRAINT "transaction_match_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_statuses"
    ADD CONSTRAINT "transaction_statuses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."transaction_statuses"
    ADD CONSTRAINT "transaction_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_unique_hash_key" UNIQUE ("unique_hash");



ALTER TABLE ONLY "public"."transaction_match_candidates"
    ADD CONSTRAINT "uq_match_pair" UNIQUE ("transaction_a_id", "transaction_b_id");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_openexchange_keys"
    ADD CONSTRAINT "user_openexchange_keys_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_pdf_passwords"
    ADD CONSTRAINT "user_pdf_passwords_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_categories_group" ON "public"."categories" USING "btree" ("group_id");



CREATE INDEX "idx_categories_user_id" ON "public"."categories" USING "btree" ("user_id");



CREATE INDEX "idx_category_groups_user_id" ON "public"."category_groups" USING "btree" ("user_id");



CREATE INDEX "idx_import_batches_user_created" ON "public"."import_batches" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_reconciliation_items_reconciliation_id" ON "public"."reconciliation_items" USING "btree" ("reconciliation_id");



CREATE INDEX "idx_reconciliation_items_transaction_id" ON "public"."reconciliation_items" USING "btree" ("transaction_id");



CREATE INDEX "idx_reconciliations_account_date" ON "public"."reconciliations" USING "btree" ("account_id", "reconciliation_date");



CREATE INDEX "idx_reconciliations_status" ON "public"."reconciliations" USING "btree" ("status");



CREATE INDEX "idx_reconciliations_user_id" ON "public"."reconciliations" USING "btree" ("user_id");



CREATE INDEX "idx_splits_category_id" ON "public"."transaction_splits" USING "btree" ("category_id");



CREATE INDEX "idx_splits_transaction_id" ON "public"."transaction_splits" USING "btree" ("transaction_id");



CREATE INDEX "idx_tags_user_id" ON "public"."tags" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_account" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_batch_lookup" ON "public"."transactions" USING "btree" ("user_id", "payee", "purchase_date");



CREATE INDEX "idx_transactions_import_batch" ON "public"."transactions" USING "btree" ("user_id", "account_id", "import_batch_id");



CREATE INDEX "idx_transactions_installment_lookup" ON "public"."transactions" USING "btree" ("user_id", "purchase_date", "payee", "payment_date" DESC);



CREATE INDEX "idx_transactions_payee_id" ON "public"."transactions" USING "btree" ("payee_id");



CREATE INDEX "idx_transactions_payee_trgm" ON "public"."transactions" USING "gin" ("payee" "public"."gin_trgm_ops");



CREATE INDEX "idx_transactions_payment_date" ON "public"."transactions" USING "btree" ("payment_date");



CREATE INDEX "idx_transactions_purchase_date" ON "public"."transactions" USING "btree" ("purchase_date");



CREATE INDEX "idx_transactions_tag_id" ON "public"."transactions" USING "btree" ("tag_id");



CREATE INDEX "idx_transactions_transfer_link_id" ON "public"."transactions" USING "btree" ("transfer_link_id") WHERE ("transfer_link_id" IS NOT NULL);



CREATE INDEX "idx_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "payees_system_name_unique" ON "public"."payees" USING "btree" ("name") WHERE ("user_id" IS NULL);



CREATE UNIQUE INDEX "tags_user_id_name_key" ON "public"."tags" USING "btree" ("user_id", "lower"("btrim"(("name")::"text")));



CREATE INDEX "user_api_keys_key_hash_idx" ON "public"."user_api_keys" USING "btree" ("key_hash");



CREATE OR REPLACE TRIGGER "accounts_auto_slug_trigger" BEFORE INSERT ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."auto_generate_account_slug"();



CREATE OR REPLACE TRIGGER "after_amount_set" AFTER UPDATE OF "amount" ON "public"."transactions" FOR EACH ROW WHEN (((COALESCE("old"."amount", (0)::numeric) = (0)::numeric) AND ("new"."amount" <> (0)::numeric))) EXECUTE FUNCTION "public"."trigger_find_and_mark_matches"();



CREATE OR REPLACE TRIGGER "protect_system_categories" BEFORE INSERT OR DELETE OR UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_system_category_modification"();



CREATE OR REPLACE TRIGGER "protect_system_category_groups" BEFORE INSERT OR DELETE OR UPDATE ON "public"."category_groups" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_system_category_group_modification"();



CREATE OR REPLACE TRIGGER "trg_set_random_category_color" BEFORE INSERT ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_random_category_color"();



CREATE OR REPLACE TRIGGER "trg_set_random_category_group_color" BEFORE INSERT ON "public"."category_groups" FOR EACH ROW EXECUTE FUNCTION "public"."set_random_category_color"();



CREATE OR REPLACE TRIGGER "trg_sync_payee" BEFORE INSERT OR UPDATE OF "payee" ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_payee_on_transaction"();



CREATE OR REPLACE TRIGGER "trg_update_amount" AFTER INSERT OR DELETE OR UPDATE ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."update_transaction_amount"();



CREATE OR REPLACE TRIGGER "trigger_check_single_starting_balance" BEFORE INSERT OR UPDATE ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."check_single_starting_balance_per_account"();



CREATE OR REPLACE TRIGGER "trigger_create_starting_balance" AFTER INSERT ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."create_starting_balance_transaction"();



CREATE OR REPLACE TRIGGER "trigger_protect_reconciled_transactions" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."protect_reconciled_transactions"();



CREATE OR REPLACE TRIGGER "trigger_protect_starting_balance_deletion" BEFORE DELETE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."protect_starting_balance_transactions"();



CREATE OR REPLACE TRIGGER "trigger_protect_starting_balance_split_deletion" BEFORE DELETE ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."protect_starting_balance_splits"();



CREATE OR REPLACE TRIGGER "trigger_warn_starting_balance_modification" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."warn_starting_balance_modification"();



CREATE OR REPLACE TRIGGER "validate_category_ownership" BEFORE INSERT OR UPDATE OF "category_id" ON "public"."categorization_rules" FOR EACH ROW EXECUTE FUNCTION "public"."validate_category_ownership"();



CREATE OR REPLACE TRIGGER "validate_category_ownership" BEFORE INSERT OR UPDATE OF "default_category_id" ON "public"."payees" FOR EACH ROW EXECUTE FUNCTION "public"."validate_category_ownership"();



CREATE OR REPLACE TRIGGER "validate_category_ownership" BEFORE INSERT OR UPDATE OF "category_id" ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."validate_category_ownership"();



ALTER TABLE ONLY "public"."account_import_rules"
    ADD CONSTRAINT "account_import_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_import_rules"
    ADD CONSTRAINT "account_import_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "public"."account_types"("id");



ALTER TABLE ONLY "public"."analysis_state"
    ADD CONSTRAINT "analysis_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_category_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id");



ALTER TABLE ONLY "public"."categorization_rules"
    ADD CONSTRAINT "categorization_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connector_accounts"
    ADD CONSTRAINT "connector_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."connector_accounts"
    ADD CONSTRAINT "connector_accounts_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connector_accounts"
    ADD CONSTRAINT "connector_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connector_sync_state"
    ADD CONSTRAINT "connector_sync_state_connector_account_id_fkey" FOREIGN KEY ("connector_account_id") REFERENCES "public"."connector_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connector_sync_state"
    ADD CONSTRAINT "connector_sync_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connectors"
    ADD CONSTRAINT "connectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."import_batches"
    ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insight_runs"
    ADD CONSTRAINT "insight_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payees"
    ADD CONSTRAINT "payees_default_category_id_fkey" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payees"
    ADD CONSTRAINT "payees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reconciliation_items"
    ADD CONSTRAINT "reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."reconciliations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reconciliation_items"
    ADD CONSTRAINT "reconciliation_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reconciliations"
    ADD CONSTRAINT "reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transaction_match_candidates"
    ADD CONSTRAINT "transaction_match_candidates_transaction_a_id_fkey" FOREIGN KEY ("transaction_a_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_match_candidates"
    ADD CONSTRAINT "transaction_match_candidates_transaction_b_id_fkey" FOREIGN KEY ("transaction_b_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_match_candidates"
    ADD CONSTRAINT "transaction_match_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."transaction_statuses"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_openexchange_keys"
    ADD CONSTRAINT "user_openexchange_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_pdf_passwords"
    ADD CONSTRAINT "user_pdf_passwords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Account types are viewable by authenticated users" ON "public"."account_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Account types can only be modified by service role" ON "public"."account_types" TO "service_role" USING (true);



CREATE POLICY "Allow full access to own payees" ON "public"."payees" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Allow full access to own transaction splits" ON "public"."transaction_splits" USING (("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Allow only logged-in users" ON "public"."transaction_statuses" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "Allow read access to system payees" ON "public"."payees" FOR SELECT USING (("user_id" IS NULL));



CREATE POLICY "Only owner can access" ON "public"."accounts" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Only owner can access" ON "public"."categorization_rules" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Only owner can access" ON "public"."import_batches" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Only owner can access" ON "public"."settings" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Only owner can access" ON "public"."transactions" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."accounts"
  WHERE (("accounts"."id" = "transactions"."account_id") AND ("accounts"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND (("to_account_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."accounts"
  WHERE (("accounts"."id" = "transactions"."to_account_id") AND ("accounts"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Users can delete own reconciliation items" ON "public"."reconciliation_items" FOR DELETE USING (("reconciliation_id" IN ( SELECT "reconciliations"."id"
   FROM "public"."reconciliations"
  WHERE ("reconciliations"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can delete own reconciliations" ON "public"."reconciliations" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own match candidates" ON "public"."transaction_match_candidates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own reconciliation items" ON "public"."reconciliation_items" FOR INSERT WITH CHECK ((("reconciliation_id" IN ( SELECT "reconciliations"."id"
   FROM "public"."reconciliations"
  WHERE ("reconciliations"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can insert own reconciliations" ON "public"."reconciliations" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own match candidates" ON "public"."transaction_match_candidates" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own reconciliation items" ON "public"."reconciliation_items" FOR UPDATE USING ((("reconciliation_id" IN ( SELECT "reconciliations"."id"
   FROM "public"."reconciliations"
  WHERE ("reconciliations"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((("reconciliation_id" IN ( SELECT "reconciliations"."id"
   FROM "public"."reconciliations"
  WHERE ("reconciliations"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can update own reconciliations" ON "public"."reconciliations" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own match candidates" ON "public"."transaction_match_candidates" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own reconciliation items" ON "public"."reconciliation_items" FOR SELECT USING (("reconciliation_id" IN ( SELECT "reconciliations"."id"
   FROM "public"."reconciliations"
  WHERE ("reconciliations"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view own reconciliations" ON "public"."reconciliations" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."account_import_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."account_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analysis_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete_policy" ON "public"."categories" FOR DELETE USING ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "categories_insert_policy" ON "public"."categories" FOR INSERT WITH CHECK ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "categories_select_policy" ON "public"."categories" FOR SELECT USING ((("id" <= 0) OR (("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "categories_update_policy" ON "public"."categories" FOR UPDATE USING ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."categorization_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "category_groups_delete_policy" ON "public"."category_groups" FOR DELETE USING ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "category_groups_insert_policy" ON "public"."category_groups" FOR INSERT WITH CHECK ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "category_groups_select_policy" ON "public"."category_groups" FOR SELECT USING ((("id" <= 0) OR (("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "category_groups_update_policy" ON "public"."category_groups" FOR UPDATE USING ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("id" > 0) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."connector_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connector_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."insight_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner" ON "public"."account_import_rules" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."accounts"
  WHERE (("accounts"."id" = "account_import_rules"."account_id") AND ("accounts"."user_id" = "auth"."uid"()))))));



CREATE POLICY "owner" ON "public"."analysis_state" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner" ON "public"."connector_accounts" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."connectors"
  WHERE (("connectors"."id" = "connector_accounts"."connector_id") AND ("connectors"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."accounts"
  WHERE (("accounts"."id" = "connector_accounts"."account_id") AND ("accounts"."user_id" = "auth"."uid"()))))));



CREATE POLICY "owner" ON "public"."connector_sync_state" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner" ON "public"."connectors" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner" ON "public"."insight_runs" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner" ON "public"."user_api_keys" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner" ON "public"."user_openexchange_keys" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner" ON "public"."user_pdf_passwords" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."payees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reconciliation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_match_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_openexchange_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_pdf_passwords" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can delete own tags" ON "public"."tags" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users can insert own tags" ON "public"."tags" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users can select own tags" ON "public"."tags" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users can update own tags" ON "public"."tags" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";





































































































































































REVOKE ALL ON FUNCTION "public"."auto_generate_account_slug"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_generate_account_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_generate_account_slug"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_reconciliation_difference"("p_account_id" integer, "p_bank_balance" numeric, "p_transaction_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_reconciliation_difference"("p_account_id" integer, "p_bank_balance" numeric, "p_transaction_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_reconciliation_difference"("p_account_id" integer, "p_bank_balance" numeric, "p_transaction_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_single_starting_balance_per_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_single_starting_balance_per_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_single_starting_balance_per_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."collapse_transactions"("p_base_id" integer, "p_other_ids" integer[], "p_resolved_fields" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."collapse_transactions"("p_base_id" integer, "p_other_ids" integer[], "p_resolved_fields" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."collapse_transactions"("p_base_id" integer, "p_other_ids" integer[], "p_resolved_fields" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_transaction_to_linked"("p_transaction_id" integer, "p_updates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_transaction_to_linked"("p_transaction_id" integer, "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_transaction_to_linked"("p_transaction_id" integer, "p_updates" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_filtered_transactions"("p_user_id" "uuid", "p_search" "text", "p_amount" numeric, "p_amount_tolerance" numeric, "p_categories" integer[], "p_tags" integer[], "p_accounts" integer[], "p_date_from" "date", "p_date_to" "date", "p_status" "text"[], "p_ignored" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_filtered_transactions"("p_user_id" "uuid", "p_search" "text", "p_amount" numeric, "p_amount_tolerance" numeric, "p_categories" integer[], "p_tags" integer[], "p_accounts" integer[], "p_date_from" "date", "p_date_to" "date", "p_status" "text"[], "p_ignored" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_filtered_transactions"("p_user_id" "uuid", "p_search" "text", "p_amount" numeric, "p_amount_tolerance" numeric, "p_categories" integer[], "p_tags" integer[], "p_accounts" integer[], "p_date_from" "date", "p_date_to" "date", "p_status" "text"[], "p_ignored" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_category_groups_and_categories"("p_groups" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_category_groups_and_categories"("p_groups" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_category_groups_and_categories"("p_groups" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_linked_transactions"("p_transaction_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_linked_transactions"("p_transaction_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_linked_transactions"("p_transaction_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_reconciliation"("p_account_id" integer, "p_reconciliation_date" "date", "p_start_date" "date", "p_end_date" "date", "p_bank_balance" numeric, "p_transaction_ids" integer[], "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_reconciliation"("p_account_id" integer, "p_reconciliation_date" "date", "p_start_date" "date", "p_end_date" "date", "p_bank_balance" numeric, "p_transaction_ids" integer[], "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_reconciliation"("p_account_id" integer, "p_reconciliation_date" "date", "p_start_date" "date", "p_end_date" "date", "p_bank_balance" numeric, "p_transaction_ids" integer[], "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_starting_balance_transaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_starting_balance_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_starting_balance_transaction"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_transaction_with_splits"("p_transaction" "jsonb", "p_splits" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_transaction_with_splits"("p_transaction" "jsonb", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_transaction_with_splits"("p_transaction" "jsonb", "p_splits" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_account"("p_account_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_account"("p_account_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_account"("p_account_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_category_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_category_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_category_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_category_and_transactions"("p_item_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_category_and_transactions"("p_item_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_category_and_transactions"("p_item_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_category_group_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_category_group_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_category_group_and_move_transactions"("p_item_id" integer, "p_target_category_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_category_group_and_transactions"("p_item_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_category_group_and_transactions"("p_item_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_category_group_and_transactions"("p_item_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_reconciliation_adjustment_transaction"("p_transaction_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_reconciliation_adjustment_transaction"("p_transaction_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_reconciliation_adjustment_transaction"("p_transaction_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."dismiss_match"("p_match_candidate_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dismiss_match"("p_match_candidate_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dismiss_match"("p_match_candidate_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."explode_transaction"("p_transaction_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."explode_transaction"("p_transaction_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."explode_transaction"("p_transaction_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_and_mark_matches"("p_account_id" integer, "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_and_mark_matches"("p_account_id" integer, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_and_mark_matches"("p_account_id" integer, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_matches_for_transaction"("p_tx_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_matches_for_transaction"("p_tx_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_matches_for_transaction"("p_tx_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_slug"("input_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_unique_slug"("input_name" "text", "user_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_unique_slug"("input_name" "text", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_unique_slug"("input_name" "text", "user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_account_balance_from_last_reconciliation"("p_account_id" integer, "p_as_of_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_account_balance_from_last_reconciliation"("p_account_id" integer, "p_as_of_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_balance_from_last_reconciliation"("p_account_id" integer, "p_as_of_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_account_balances"("account_id_param" integer, "p_today" "date") TO "anon";



REVOKE ALL ON FUNCTION "public"."get_analysis_state"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_analysis_state"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_analysis_state"("p_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_category_ranking"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "sort_by" "text", "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_category_ranking"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "sort_by" "text", "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_category_ranking"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "sort_by" "text", "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_daily_spending"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_spending"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_spending"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dashboard_category_trends"("p_month" "date", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_category_trends"("p_month" "date", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_category_trends"("p_month" "date", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dashboard_installments"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_installments"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_installments"("p_month" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_dashboard_installments"("p_month" "date") TO "anon";



REVOKE ALL ON FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_totals"("p_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dashboard_surprises"("p_month" "date", "p_baseline_months" integer, "p_min_baseline" numeric, "p_threshold" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_surprises"("p_month" "date", "p_baseline_months" integer, "p_min_baseline" numeric, "p_threshold" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_surprises"("p_month" "date", "p_baseline_months" integer, "p_min_baseline" numeric, "p_threshold" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_expense_breakdown"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_expense_breakdown"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expense_breakdown"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_expense_trends"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_expense_trends"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expense_trends"("start_date" "date", "end_date" "date", "input_group_ids" integer[], "input_account_ids" integer[], "input_category_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_income_vs_expenses"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_income_vs_expenses"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_income_vs_expenses"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_income_vs_expenses_multi_year"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_income_vs_expenses_multi_year"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_income_vs_expenses_multi_year"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_insight_run"("p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_insight_run"("p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_insight_run"("p_month" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_largest_transactions"("p_start" "date", "p_end" "date", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_largest_transactions"("p_start" "date", "p_end" "date", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_largest_transactions"("p_start" "date", "p_end" "date", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_merchant_scatter"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_merchant_scatter"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_merchant_scatter"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_month_close"("p_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_month_close"("p_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_month_close"("p_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_new_merchants"("p_month" "date", "p_lookback_months" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_new_merchants"("p_month" "date", "p_lookback_months" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_new_merchants"("p_month" "date", "p_lookback_months" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_reconciliation_info_for_adjustment"("p_transaction_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_reconciliation_info_for_adjustment"("p_transaction_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reconciliation_info_for_adjustment"("p_transaction_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_reimbursements"("p_start" "date", "p_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_reimbursements"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reimbursements"("p_start" "date", "p_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_seasonal_pattern"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_seasonal_pattern"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_seasonal_pattern"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tag_summary"("p_tag_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tag_summary"("p_tag_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tag_summary"("p_tag_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ticket_size_stats"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ticket_size_stats"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ticket_size_stats"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_top_merchants_for_category"("input_category_id" integer, "start_date" "date", "end_date" "date", "input_account_ids" integer[], "limit_n" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_top_merchants_for_category"("input_category_id" integer, "start_date" "date", "end_date" "date", "input_account_ids" integer[], "limit_n" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_merchants_for_category"("input_category_id" integer, "start_date" "date", "end_date" "date", "input_account_ids" integer[], "limit_n" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_transaction_size_distribution"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "bucket_size" integer, "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_transaction_size_distribution"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "bucket_size" integer, "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transaction_size_distribution"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "bucket_size" integer, "input_excluded_tag_ids" integer[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_weekday_heatmap"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_weekday_heatmap"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekday_heatmap"("start_date" "date", "end_date" "date", "input_account_ids" integer[], "input_category_ids" integer[], "input_group_ids" integer[], "input_excluded_tag_ids" integer[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_transaction_reconciled"("transaction_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_transaction_reconciled"("transaction_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_transaction_reconciled"("transaction_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer, "p_split_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer, "p_split_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_transactions"("p_winner_id" integer, "p_loser_id" integer, "p_resolved_fields" "jsonb", "p_match_candidate_id" integer, "p_split_source" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_system_category_group_modification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_system_category_group_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_system_category_group_modification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_system_category_modification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_system_category_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_system_category_modification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_system_record_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_system_record_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_system_record_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_reconciled_transactions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_reconciled_transactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_reconciled_transactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_starting_balance_splits"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_starting_balance_splits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_starting_balance_splits"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_starting_balance_transactions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_starting_balance_transactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_starting_balance_transactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_transaction_from_all_reconciliations"("p_transaction_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_transaction_from_all_reconciliations"("p_transaction_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_transaction_from_all_reconciliations"("p_transaction_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_transaction_from_reconciliation"("p_transaction_id" integer, "p_reconciliation_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_transaction_from_reconciliation"("p_transaction_id" integer, "p_reconciliation_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_transaction_from_reconciliation"("p_transaction_id" integer, "p_reconciliation_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_installment_series"("p_as_of" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_installment_series"("p_as_of" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_installment_series"("p_as_of" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."resolve_installment_series"("p_as_of" "date") TO "anon";



REVOKE ALL ON FUNCTION "public"."reveal_and_clear_api_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reveal_and_clear_api_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reveal_and_clear_api_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rotate_api_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rotate_api_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rotate_api_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_insight_run"("p_month" "text", "p_content" "text", "p_model" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_insight_run"("p_month" "text", "p_content" "text", "p_model" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_insight_run"("p_month" "text", "p_content" "text", "p_model" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_analysis_state"("p_month" "date", "p_state" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_analysis_state"("p_month" "date", "p_state" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_analysis_state"("p_month" "date", "p_state" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_default_auth_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_default_auth_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_auth_role"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_default_auth_role"() TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_random_category_color"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_random_category_color"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_random_category_color"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."soft_delete_reconciliation"("p_reconciliation_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."soft_delete_reconciliation"("p_reconciliation_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_reconciliation"("p_reconciliation_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_payee_on_transaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_payee_on_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_payee_on_transaction"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_find_and_mark_matches"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_find_and_mark_matches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_find_and_mark_matches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transaction_amount"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transaction_amount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_transaction_amount"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transaction_with_splits"("p_transaction_id" bigint, "p_transaction" "jsonb", "p_splits" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transaction_with_splits"("p_transaction_id" bigint, "p_transaction" "jsonb", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_transaction_with_splits"("p_transaction_id" bigint, "p_transaction" "jsonb", "p_splits" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_category_ownership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_category_ownership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_category_ownership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."warn_starting_balance_modification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."warn_starting_balance_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."warn_starting_balance_modification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."account_import_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."account_import_rules" TO "service_role";



GRANT ALL ON TABLE "public"."account_types" TO "authenticated";
GRANT ALL ON TABLE "public"."account_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."account_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."account_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."accounts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."accounts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."analysis_state" TO "authenticated";
GRANT ALL ON TABLE "public"."analysis_state" TO "service_role";



GRANT ALL ON SEQUENCE "public"."analysis_state_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."analysis_state_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."categorization_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."categorization_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."categorization_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."categorization_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."category_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."category_groups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."category_groups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."category_groups_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."connector_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."connector_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."connector_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."connector_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."connectors" TO "authenticated";
GRANT ALL ON TABLE "public"."connectors" TO "service_role";



GRANT ALL ON TABLE "public"."import_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."import_batches" TO "service_role";



GRANT ALL ON TABLE "public"."insight_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."insight_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."insight_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."insight_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."payees" TO "authenticated";
GRANT ALL ON TABLE "public"."payees" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payees_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payees_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reconciliation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."reconciliation_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reconciliation_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reconciliation_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reconciliations" TO "authenticated";
GRANT ALL ON TABLE "public"."reconciliations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reconciliations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reconciliations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."settings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_match_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_match_candidates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transaction_match_candidates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transaction_match_candidates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_splits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transaction_splits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transaction_splits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_statuses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transaction_statuses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transaction_statuses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_api_keys" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."user_api_keys" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."user_api_keys" TO "authenticated";



GRANT SELECT("key_preview") ON TABLE "public"."user_api_keys" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."user_api_keys" TO "authenticated";



GRANT SELECT("last_used_at") ON TABLE "public"."user_api_keys" TO "authenticated";



GRANT SELECT("revoked_at") ON TABLE "public"."user_api_keys" TO "authenticated";



GRANT ALL ON TABLE "public"."user_openexchange_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_openexchange_keys" TO "service_role";



GRANT ALL ON TABLE "public"."user_pdf_passwords" TO "authenticated";
GRANT ALL ON TABLE "public"."user_pdf_passwords" TO "service_role";



GRANT ALL ON TABLE "public"."v_payee_transaction_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."v_payee_transaction_counts" TO "service_role";
GRANT ALL ON TABLE "public"."v_payee_transaction_counts" TO "anon";



GRANT ALL ON TABLE "public"."v_transaction_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."v_transaction_splits" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC;





























--
-- Triggers on auth.users (the dump skips the auth schema, so they are added by hand)
--

CREATE OR REPLACE TRIGGER "users_set_default_role" BEFORE INSERT OR UPDATE ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_auth_role"();

-- convert_transaction_to_linked: carry the original's statement_identifier onto
-- the primary leg. The original row is deleted, so without this the bank/Pluggy
-- id disappears and the next sync re-imports the same line as a regular
-- transaction. The mirror leg lives in another account and gets no id.

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
      'transfer_link_id', v_transfer_link_id,
      'statement_identifier', v_current.statement_identifier
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

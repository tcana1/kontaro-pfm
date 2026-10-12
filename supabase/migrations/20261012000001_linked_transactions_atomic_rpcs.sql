-- Atomic transfer/payment pair operations.
--
-- 1. convert_transaction_to_linked turns the original row INTO the primary leg
--    in place (keeping its id, unique_hash and statement_identifier) and creates
--    a single mirror leg. Nothing is deleted, so an imported row stays
--    deduplicatable. It returns a snapshot of the original row and splits so the
--    conversion can be undone exactly.
-- 2. undo_convert_transaction_to_linked: deletes the mirror leg and resets the
--    primary row and its splits back to the snapshot, in one transaction. Only
--    the columns the conversion touched are restored, so it can't drift as new
--    columns are added to transactions.
-- 3. update_linked_transactions: edits both legs of an existing pair in one
--    transaction. The client used to issue several PATCH/POST calls and inserted
--    an extra split on the mirror leg whenever `notes` was sent, doubling its amount.

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
  v_linked_hash text;
  v_primary jsonb;
  v_linked jsonb;
  v_original jsonb;
  v_original_splits jsonb;
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

  -- Snapshot the original (row + splits) before mutating, so the caller can undo
  -- the conversion exactly. The app's view of a transaction lacks the fields the
  -- undo needs to restore (type, status, the untouched account), so it ships this.
  v_original := to_jsonb(v_current);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'category_id', s.category_id,
           'amount',      s.amount,
           'observation', s.observation
         ) ORDER BY s.id), '[]'::jsonb)
  INTO v_original_splits
  FROM transaction_splits s
  WHERE s.transaction_id = v_current.id;

  -- Convert the original row IN PLACE into the primary (source) leg. Its id,
  -- unique_hash and statement_identifier are kept, so an imported row stays
  -- deduplicatable and nothing has to be deleted and recreated. status forced to
  -- Cleared, matching the app's behavior for created transfer/payment pairs.
  UPDATE transactions
  SET type = v_type::transaction_type,
      account_id = v_account_id,
      to_account_id = v_to_account_id,
      transfer_link_id = v_transfer_link_id,
      payee = v_primary_payee,
      payment_date = v_payment_date,
      purchase_date = v_payment_date,
      status_id = 2
  WHERE id = v_current.id;

  -- Collapse to one split carrying the chosen category/amount/notes
  -- (trg_update_amount recomputes transactions.amount from it).
  DELETE FROM transaction_splits WHERE transaction_id = v_current.id;
  INSERT INTO transaction_splits (transaction_id, category_id, amount, observation)
  VALUES (v_current.id, v_category_id, v_amount, v_notes);

  -- Mirror (destination) leg — opposite amount, swapped accounts, fresh row.
  -- Its hash derives from the primary's own (now unchanged) unique_hash.
  v_linked_hash := encode(extensions.digest(v_current.unique_hash || '_linked', 'sha256'), 'hex');
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

  SELECT to_jsonb(t) INTO v_primary FROM transactions t WHERE t.id = v_current.id;

  RETURN jsonb_build_object(
    'primary', v_primary,
    'linked', v_linked,
    'original', v_original,
    'original_splits', v_original_splits
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."undo_convert_transaction_to_linked"("p_transaction_id" integer, "p_original" "jsonb", "p_original_splits" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current transactions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF jsonb_typeof(p_original_splits) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_original_splits) = 0 THEN
    RAISE EXCEPTION 'original splits are required';
  END IF;

  SELECT * INTO v_current FROM transactions WHERE id = p_transaction_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_current.transfer_link_id IS NULL OR v_current.to_account_id IS NULL THEN
    RAISE EXCEPTION 'Transaction is not a converted pair';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reconciliation_items ri
    JOIN reconciliations r ON r.id = ri.reconciliation_id
    JOIN transactions t ON t.id = ri.transaction_id
    WHERE t.transfer_link_id = v_current.transfer_link_id
      AND t.user_id = v_user_id
      AND r.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot undo: the transfer/payment was reconciled. Remove it from reconciliation first.';
  END IF;

  -- Drop the mirror leg (the other member of the pair).
  DELETE FROM transactions
  WHERE transfer_link_id = v_current.transfer_link_id
    AND id <> p_transaction_id
    AND user_id = v_user_id;

  -- Reset the row the conversion mutated back to the snapshot. id, unique_hash
  -- and statement_identifier were never touched, so they need no restoring.
  UPDATE transactions
  SET type = (p_original->>'type')::transaction_type,
      account_id = (p_original->>'account_id')::integer,
      to_account_id = (p_original->>'to_account_id')::integer,
      transfer_link_id = (p_original->>'transfer_link_id')::uuid,
      payee = p_original->>'payee',
      payment_date = (p_original->>'payment_date')::date,
      purchase_date = COALESCE((p_original->>'purchase_date')::date, (p_original->>'payment_date')::date),
      status_id = (p_original->>'status_id')::integer
  WHERE id = p_transaction_id;

  DELETE FROM transaction_splits WHERE transaction_id = p_transaction_id;
  INSERT INTO transaction_splits (transaction_id, category_id, amount, observation)
  SELECT
    p_transaction_id,
    (s->>'category_id')::integer,
    (s->>'amount')::numeric,
    COALESCE(s->>'observation', '')
  FROM jsonb_array_elements(p_original_splits) AS s;

  RETURN jsonb_build_object('original', (SELECT to_jsonb(t) FROM transactions t WHERE t.id = p_transaction_id));
END;
$$;

ALTER FUNCTION "public"."undo_convert_transaction_to_linked"("p_transaction_id" integer, "p_original" "jsonb", "p_original_splits" "jsonb") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."undo_convert_transaction_to_linked"("p_transaction_id" integer, "p_original" "jsonb", "p_original_splits" "jsonb") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."undo_convert_transaction_to_linked"("p_transaction_id" integer, "p_original" "jsonb", "p_original_splits" "jsonb") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."undo_convert_transaction_to_linked"("p_transaction_id" integer, "p_original" "jsonb", "p_original_splits" "jsonb") TO "service_role";


-- Edits an existing transfer/payment pair. `p_transaction_id` is the leg the user
-- opened (either one). Recognized keys in p_updates: type, account_id,
-- to_account_id, payment_date, amount, notes, category_id, plus status_id and
-- is_ignored (applied to the edited leg only). `payee` is ignored:
-- both legs' payees are derived ("Payment to X" / "Payment from Y") and only
-- regenerated when type or accounts change. The leg with the lower id is the
-- primary ("to") leg, matching the creation order of every pair-building RPC.
-- `amount` is the edited leg's amount; the other leg gets its negation.
CREATE OR REPLACE FUNCTION "public"."update_linked_transactions"("p_transaction_id" integer, "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_edited transactions%ROWTYPE;
  v_mirror transactions%ROWTYPE;
  v_mirror_count integer;
  v_has_mirror boolean := false;
  v_type text;
  v_label text;
  v_account_id integer;
  v_to_account_id integer;
  v_payment_date date;
  v_amount numeric;
  v_category_id integer;
  v_set_notes boolean := p_updates ? 'notes';
  v_notes text := COALESCE(p_updates->>'notes', '');
  v_edited_is_primary boolean;
  v_regenerate_payees boolean;
  v_edited_payee text;
  v_mirror_payee text;
  v_account_name text;
  v_to_account_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_edited FROM transactions WHERE id = p_transaction_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_edited.to_account_id IS NULL OR v_edited.type NOT IN ('transfer', 'payment') THEN
    RAISE EXCEPTION 'Transaction is not a transfer/payment';
  END IF;

  -- Mirror leg: by link id, falling back to the heuristic for old pairs that
  -- predate transfer_link_id. Zero or ambiguous matches => edit this leg only.
  IF v_edited.transfer_link_id IS NOT NULL THEN
    SELECT count(*) INTO v_mirror_count
    FROM transactions
    WHERE transfer_link_id = v_edited.transfer_link_id AND id <> v_edited.id AND user_id = v_user_id;
    IF v_mirror_count = 1 THEN
      SELECT * INTO v_mirror
      FROM transactions
      WHERE transfer_link_id = v_edited.transfer_link_id AND id <> v_edited.id AND user_id = v_user_id;
      v_has_mirror := true;
    END IF;
  ELSE
    SELECT count(*) INTO v_mirror_count
    FROM transactions
    WHERE id <> v_edited.id AND user_id = v_user_id AND transfer_link_id IS NULL
      AND account_id = v_edited.to_account_id AND to_account_id = v_edited.account_id
      AND payment_date = v_edited.payment_date AND amount = -v_edited.amount
      AND type = v_edited.type;
    IF v_mirror_count = 1 THEN
      SELECT * INTO v_mirror
      FROM transactions
      WHERE id <> v_edited.id AND user_id = v_user_id AND transfer_link_id IS NULL
        AND account_id = v_edited.to_account_id AND to_account_id = v_edited.account_id
        AND payment_date = v_edited.payment_date AND amount = -v_edited.amount
        AND type = v_edited.type;
      v_has_mirror := true;
    END IF;
  END IF;

  IF (SELECT count(*) FROM transaction_splits WHERE transaction_id = v_edited.id) > 1
     OR (v_has_mirror AND (SELECT count(*) FROM transaction_splits WHERE transaction_id = v_mirror.id) > 1) THEN
    RAISE EXCEPTION 'Cannot edit a transfer/payment that has multiple splits';
  END IF;

  v_type := COALESCE(NULLIF(p_updates->>'type', ''), v_edited.type::text);
  IF v_type NOT IN ('transfer', 'payment') THEN
    RAISE EXCEPTION 'Invalid type for a linked transaction: %', v_type;
  END IF;

  v_account_id := COALESCE((p_updates->>'account_id')::integer, v_edited.account_id);
  v_to_account_id := COALESCE((p_updates->>'to_account_id')::integer, v_edited.to_account_id);
  v_payment_date := COALESCE((p_updates->>'payment_date')::date, v_edited.payment_date);
  v_amount := COALESCE((p_updates->>'amount')::numeric, v_edited.amount);
  v_category_id := (p_updates->>'category_id')::integer;

  IF v_account_id = v_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must differ';
  END IF;

  v_edited_is_primary := NOT v_has_mirror OR v_edited.id < v_mirror.id;
  v_regenerate_payees := v_type <> v_edited.type::text
    OR v_account_id <> v_edited.account_id
    OR v_to_account_id <> v_edited.to_account_id;

  v_edited_payee := v_edited.payee;
  v_mirror_payee := CASE WHEN v_has_mirror THEN v_mirror.payee END;

  IF v_regenerate_payees THEN
    SELECT name INTO v_account_name FROM accounts WHERE id = v_account_id AND user_id = v_user_id;
    SELECT name INTO v_to_account_name FROM accounts WHERE id = v_to_account_id AND user_id = v_user_id;
    IF v_account_name IS NULL OR v_to_account_name IS NULL THEN
      RAISE EXCEPTION 'Could not fetch account names for linked transaction payees';
    END IF;

    v_label := CASE v_type WHEN 'transfer' THEN 'Transfer' ELSE 'Payment' END;
    IF v_edited_is_primary THEN
      v_edited_payee := v_label || ' to ' || v_to_account_name;
      v_mirror_payee := v_label || ' from ' || v_account_name;
    ELSE
      v_edited_payee := v_label || ' from ' || v_to_account_name;
      v_mirror_payee := v_label || ' to ' || v_account_name;
    END IF;
  END IF;

  UPDATE transactions
  SET type = v_type::transaction_type,
      account_id = v_account_id,
      to_account_id = v_to_account_id,
      payment_date = v_payment_date,
      purchase_date = v_payment_date,
      payee = v_edited_payee,
      status_id = COALESCE((p_updates->>'status_id')::integer, status_id),
      is_ignored = COALESCE((p_updates->>'is_ignored')::boolean, is_ignored)
  WHERE id = v_edited.id;

  UPDATE transaction_splits
  SET amount = v_amount,
      category_id = COALESCE(v_category_id, category_id),
      observation = CASE WHEN v_set_notes THEN v_notes ELSE observation END
  WHERE transaction_id = v_edited.id;

  IF v_has_mirror THEN
    UPDATE transactions
    SET type = v_type::transaction_type,
        account_id = v_to_account_id,
        to_account_id = v_account_id,
        payment_date = v_payment_date,
        purchase_date = v_payment_date,
        payee = v_mirror_payee
    WHERE id = v_mirror.id;

    UPDATE transaction_splits
    SET amount = -v_amount,
        category_id = COALESCE(v_category_id, category_id),
        observation = CASE WHEN v_set_notes THEN v_notes ELSE observation END
    WHERE transaction_id = v_mirror.id;
  END IF;

  RETURN jsonb_build_object(
    'primary', (SELECT to_jsonb(t) FROM transactions t WHERE t.id = v_edited.id),
    'linked',  CASE WHEN v_has_mirror THEN (SELECT to_jsonb(t) FROM transactions t WHERE t.id = v_mirror.id) END
  );
END;
$$;

ALTER FUNCTION "public"."update_linked_transactions"("p_transaction_id" integer, "p_updates" "jsonb") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."update_linked_transactions"("p_transaction_id" integer, "p_updates" "jsonb") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."update_linked_transactions"("p_transaction_id" integer, "p_updates" "jsonb") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_linked_transactions"("p_transaction_id" integer, "p_updates" "jsonb") TO "service_role";

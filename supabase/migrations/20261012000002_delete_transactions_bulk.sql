-- Atomic bulk delete of transactions.
--
-- Deletes the given ids plus the other leg of every transfer/payment pair among
-- them, in a single statement: the whole selection is deleted or none of it is.
-- The client used to delete one id at a time (several requests per row), so a
-- failure part-way left a selection half-deleted.
--
-- Partner leg: by transfer_link_id, falling back to the heuristic for old pairs
-- that predate it. Zero or ambiguous heuristic matches => only the selected leg
-- is deleted, never a guessed sibling.
--
-- Not for reconciliation adjustments (category -2): those must go through
-- delete_reconciliation_adjustment_transaction, which also undoes the
-- reconciliation. Starting balance rows are still refused by the existing
-- BEFORE DELETE trigger, which aborts the whole statement. Splits,
-- reconciliation_items and match candidates go away via ON DELETE CASCADE.
--
-- Ids that don't belong to the caller are silently skipped. Returns the ids
-- actually deleted, partners included.

CREATE OR REPLACE FUNCTION "public"."delete_transactions"("p_ids" integer[]) RETURNS integer[]
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted integer[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH selected AS (
    SELECT id, account_id, to_account_id, type, payment_date, amount, transfer_link_id
    FROM transactions
    WHERE id = ANY(p_ids) AND user_id = v_user_id
  ), linked AS (
    SELECT * FROM selected
    WHERE to_account_id IS NOT NULL AND type IN ('transfer', 'payment')
  ), partners AS (
    SELECT p.id
    FROM linked l
    JOIN transactions p
      ON p.user_id = v_user_id AND p.id <> l.id AND p.transfer_link_id = l.transfer_link_id
    WHERE l.transfer_link_id IS NOT NULL
    UNION
    SELECT min(p.id)
    FROM linked l
    JOIN transactions p
      ON p.user_id = v_user_id AND p.id <> l.id AND p.transfer_link_id IS NULL
     AND p.account_id = l.to_account_id AND p.to_account_id = l.account_id
     AND p.payment_date = l.payment_date AND p.amount = -l.amount
     AND p.type = l.type
    WHERE l.transfer_link_id IS NULL
    GROUP BY l.id
    HAVING count(*) = 1
  ), doomed AS (
    SELECT id FROM selected
    UNION
    SELECT id FROM partners
  ), deleted AS (
    DELETE FROM transactions t
    USING doomed d
    WHERE t.id = d.id AND t.user_id = v_user_id
    RETURNING t.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

ALTER FUNCTION "public"."delete_transactions"("p_ids" integer[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."delete_transactions"("p_ids" integer[]) FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_transactions"("p_ids" integer[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_transactions"("p_ids" integer[]) TO "service_role";

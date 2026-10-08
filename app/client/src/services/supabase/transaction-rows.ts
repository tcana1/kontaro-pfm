import { supabase } from '../../lib/supabase';

// Split-aware writes against a single transactions row. Deliberately blind to
// transfer/payment pairing so linked-transactions.ts can call in here without
// re-entering its own dispatch logic.

function toSplitsPayload(splits: any[]) {
  return splits.map((s: any) => ({
    category_id: s.categoryId ?? s.category_id,
    amount: s.amount,
    observation: s.notes || s.observation || '',
  }));
}

export async function insertTransaction(data: Record<string, any>): Promise<any> {
  const {
    amount: transactionAmount,
    category_id,
    notes,
    is_installment, // Exclude computed column
    isSplitTransaction,
    splits,
    ...transactionData
  } = data;

  // Build splits array for the atomic RPC
  let splitsPayload: Array<{ category_id: number; amount: number; observation: string }>;
  if (isSplitTransaction && splits && splits.length > 0) {
    splitsPayload = toSplitsPayload(splits);
  } else {
    splitsPayload = [{
      category_id: category_id,
      amount: transactionAmount,
      observation: notes || '',
    }];
  }

  const { data: transaction, error } = await supabase.rpc(
    'create_transaction_with_splits',
    { p_transaction: transactionData, p_splits: splitsPayload },
  );

  if (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }

  return transaction;
}

// In-place split-aware update of a transactions row. Never routes through
// linked-transaction logic — that's crud.update()'s job. Internal paths in
// updateLinkedTransactions() call this directly to avoid infinite recursion
// (update() re-routing linked-ish payloads back to the linked path).
export async function updateTransactionRow(id: number, data: Record<string, any>) {
  const { category_id: splitCategoryId, notes: splitNotes, split_id, isSplitTransaction, splits, ...transactionData } = data;

  // Multi-split update: use atomic RPC so transaction + splits succeed or fail together
  if (isSplitTransaction && splits && splits.length > 0) {
    const splitsPayload = toSplitsPayload(splits);

    const { data: transaction, error } = await supabase.rpc(
      'update_transaction_with_splits',
      { p_transaction_id: id, p_transaction: transactionData, p_splits: splitsPayload },
    );

    if (error) {
      console.error('Error updating transaction with splits:', error);
      throw error;
    }

    return transaction;
  }

  // Non-split update: update the transaction row first
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .update(transactionData)
    .eq('id', id)
    .select()
    .single();

  if (transactionError) {
    console.error('Error updating transaction:', transactionError);
    throw transactionError;
  }

  // Handle single-split update/creation
  if (splitCategoryId !== undefined || splitNotes !== undefined) {
    if (split_id) {
      const splitData: Record<string, any> = {};
      if (splitCategoryId !== undefined) splitData.category_id = splitCategoryId;
      if (data.amount !== undefined) splitData.amount = data.amount;
      splitData.observation = splitNotes === undefined ? '' : splitNotes;

      const { error: splitError } = await supabase
        .from('transaction_splits')
        .update(splitData)
        .eq('id', split_id);

      if (splitError) {
        console.error('Error updating split:', splitError);
        throw splitError;
      }
    } else {
      const { error: splitError } = await supabase
        .from('transaction_splits')
        .insert({
          transaction_id: transaction.id,
          category_id: splitCategoryId,
          amount: data.amount,
          observation: splitNotes,
        });

      if (splitError) {
        console.error('Error creating split:', splitError);
        throw splitError;
      }
    }
  }

  return transaction;
}

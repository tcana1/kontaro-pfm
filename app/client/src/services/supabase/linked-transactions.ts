import { supabase } from '../../lib/supabase';
import { sha256 } from '../../utils/hash-utils';
import { sanitizeTransactionForUpdate } from '../../utils/transaction-utils';
import { findLinkedTransaction } from '../transaction-query-helpers';
import { deleteRow } from './rows';
import { insertTransaction, updateTransactionRow } from './transaction-rows';

// The transfer/payment pair lifecycle: creation, conversion from a regular
// transaction, update and deletion of both legs.

async function getTransactionByHash(hash: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('unique_hash', hash)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

export async function createUniqueTransaction(data: Record<string, any>, force = false): Promise<any> {
  const sanitizedData = sanitizeTransactionForUpdate(data);
  // Not part of the update-safe field list, but needed when re-creating a deleted transaction (undo).
  for (const key of ['tag_id', 'statement_identifier', 'import_batch_id']) {
    if (data[key] != null) sanitizedData[key] = data[key];
  }
  const { type, to_account_id } = sanitizedData;

  // Transfer/payment pairs are created atomically via RPC — dedup is handled server-side.
  if ((type === 'transfer' || type === 'payment') && to_account_id) {
    return createLinkedTransactions(sanitizedData);
  }

  const { payment_date, payee, amount, installment_number, account_id } = sanitizedData;
  const baseHashString = `${payment_date}${payee}${parseFloat(amount).toFixed(2)}${installment_number || ''}${account_id}`;
  const baseHash = await sha256(baseHashString);

  const existingTransaction = await getTransactionByHash(baseHash);

  if (existingTransaction && !force) {
    const duplicateError = new Error('Duplicate transaction found.');
    duplicateError.name = 'DuplicateTransactionError';
    throw duplicateError;
  }

  let finalHash = baseHash;
  if (existingTransaction) {
    let counter = 1;
    while (true) {
      if (counter > 50) {
        throw new Error('Could not find a unique hash after 50 attempts.');
      }
      const newHashString = `${baseHashString}_${counter}`;
      finalHash = await sha256(newHashString);
      const collision = await getTransactionByHash(finalHash);
      if (!collision) {
        break;
      }
      counter++;
    }
  }

  return insertTransaction({ ...sanitizedData, unique_hash: finalHash });
}

// Atomically creates a linked transfer/payment pair (both legs) via a single
// RPC call — see the create_linked_transactions migration for the server-side logic.
export async function createLinkedTransactions(primaryTransactionData: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.rpc('create_linked_transactions' as any, {
    p_transaction_data: primaryTransactionData,
  });
  if (error) throw error;
  return (data as any).primary;
}

// What the conversion RPC returns: the primary leg (the original row, converted
// in place — same id), the new mirror leg, and a snapshot of the original row
// and splits, which is exactly what undoConvertTransactionToLinked() needs.
export interface ConvertedLinkedPair {
  primary: { id: number } & Record<string, any>;
  linked: { id: number } & Record<string, any>;
  original: Record<string, any>;
  original_splits: Array<Record<string, any>>;
}

// Atomically converts a regular transaction into a linked transfer/payment pair
// via a single RPC call: the original row becomes the primary leg in place and a
// mirror leg is created — see the convert_transaction_to_linked migration.
// The only conversion path: UpdateTransactionCommand and updateLinkedTransactions()
// both go through it, so the original's statement_identifier is always carried over.
export async function convertTransactionToLinked(
  transactionId: number,
  updates: Record<string, any>
): Promise<ConvertedLinkedPair> {
  const { data, error } = await supabase.rpc('convert_transaction_to_linked' as any, {
    p_transaction_id: transactionId,
    p_updates: updates,
  });

  if (error) {
    throw error;
  }

  return data as ConvertedLinkedPair;
}

// Reverses convertTransactionToLinked in one RPC: deletes the mirror leg and
// resets the primary row (same id throughout) and its splits back to the snapshot.
export async function undoConvertTransactionToLinked(pair: ConvertedLinkedPair): Promise<void> {
  const { error } = await supabase.rpc('undo_convert_transaction_to_linked' as any, {
    p_transaction_id: pair.primary.id,
    p_original: pair.original,
    p_original_splits: pair.original_splits,
  });
  if (error) throw error;
}

export async function updateLinkedTransactions(transactionId: number, updates: Record<string, any>): Promise<any> {
  // Get the current transaction to check if it's linked
  const { data: currentTransaction, error } = await supabase
    .from('transactions')
    .select('type, to_account_id')
    .eq('id', transactionId)
    .single();

  if (error) throw error;

  if (!currentTransaction.to_account_id ||
      (currentTransaction.type !== 'transfer' && currentTransaction.type !== 'payment')) {
    // Regular transaction in the DB.
    // If the update itself carries linked fields, this is a conversion attempt
    // -> convert atomically via the RPC. Otherwise apply it as a plain row
    // update directly (NOT via update(), which routes back here — that used to
    // cause an infinite request loop).
    const converts = (updates.type === 'transfer' || updates.type === 'payment') && updates.to_account_id;
    if (converts) {
      const { primary } = await convertTransactionToLinked(transactionId, {
        account_id: updates.account_id,
        to_account_id: updates.to_account_id,
        payment_date: updates.payment_date,
        amount: updates.amount,
        payee: updates.payee,
        notes: updates.notes,
        type: updates.type,
        category_id: updates.category_id,
      });
      return primary;
    }
    return updateTransactionRow(transactionId, updates);
  }

  // Edit both legs atomically server-side (mirror lookup, sign flip, payee
  // regeneration). The edited leg is returned as `primary`.
  const { data, error: rpcError } = await supabase.rpc('update_linked_transactions' as any, {
    p_transaction_id: transactionId,
    p_updates: {
      type: updates.type,
      account_id: updates.account_id,
      to_account_id: updates.to_account_id,
      payment_date: updates.payment_date,
      amount: updates.amount,
      notes: updates.notes,
      category_id: updates.category_id,
      status_id: updates.status_id,
      is_ignored: updates.is_ignored,
    },
  });
  if (rpcError) throw rpcError;
  return (data as any).primary;
}

export const deletingTransactionIds = new Set<number>();

// `deletedIds`, when given, collects every id removed (primary and partner) so a
// bulk caller can skip partners that were already deleted with their pair.
export async function deleteLinkedTransactions(
  transactionId: number,
  deletedIds?: Set<number>,
): Promise<boolean> {
  // Prevent infinite recursion by tracking which transactions we're already deleting
  if (deletingTransactionIds.has(transactionId)) {
    return true;
  }

  deletingTransactionIds.add(transactionId);

  // Declared outside try so finally can clean it up from deletingTransactionIds.
  let linkedTransactionId: number | null = null;

  try {
    // Get the current transaction to check if it's linked
    const { data: currentTransaction, error } = await supabase
      .from('transactions')
      .select('id, account_id, to_account_id, type, payment_date, amount, transfer_link_id')
      .eq('id', transactionId)
      .maybeSingle();

    if (error) {
      console.error(`❌ DELETE LINKED: Error fetching transaction ${transactionId}:`, error);
      throw error;
    }

    // Already gone (e.g. deleted as the partner of another leg) — nothing to do.
    if (!currentTransaction) {
      deletedIds?.add(transactionId);
      return true;
    }

    if (!currentTransaction.to_account_id ||
        (currentTransaction.type !== 'transfer' && currentTransaction.type !== 'payment')) {
      await deleteRow('transactions', transactionId);
      deletedIds?.add(transactionId);
      return true;
    }

    // Find the linked transaction — prefer deterministic link UUID, fall back to heuristic
    // for older transfers created before transfer_link_id existed.
    const linked = await findLinkedTransaction(currentTransaction as any, 'id', true);
    linkedTransactionId = linked ? linked.id : null;

    if (linkedTransactionId !== null) {
      deletingTransactionIds.add(linkedTransactionId);
      await deleteRow('transactions', linkedTransactionId);
      deletedIds?.add(linkedTransactionId);
    } else {
      console.warn(`⚠️  DELETE LINKED: No linked transaction found for ${transactionId}, may be orphaned`);
    }

    // Delete the primary transaction
    await deleteRow('transactions', transactionId);
    deletedIds?.add(transactionId);
    return true;
  } finally {
    // Clean up tracking to avoid memory leaks
    deletingTransactionIds.delete(transactionId);
    if (linkedTransactionId !== null) {
      deletingTransactionIds.delete(linkedTransactionId);
    }
  }
}

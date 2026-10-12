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

// The two legs the RPC returns: each is a full transactions row (as jsonb), of
// which only `id` is consumed by the caller (for undo cleanup).
export interface ConvertedLinkedPair {
  primary: { id: number } & Record<string, any>;
  linked: { id: number } & Record<string, any>;
}

// Atomically converts a regular transaction into a linked transfer/payment
// pair (create primary + mirror, delete the original) via a single RPC call —
// see the convert_transaction_to_linked migration for the server-side logic.
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

export async function updateLinkedTransactions(transactionId: number, updates: Record<string, any>): Promise<any> {
  // Get the current transaction to check if it's linked
  const { data: currentTransaction, error } = await supabase
    .from('transactions')
    .select('*')
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

  // Find the linked transaction — prefer deterministic link UUID, fall back to heuristic
  // for older transfers created before transfer_link_id existed.
  const linkedTransaction = await findLinkedTransaction(currentTransaction as any, '*');

  if (!linkedTransaction) {
    console.warn('Linked transaction not found, updating primary transaction only');
    return updateTransactionRow(transactionId, updates);
  }

  // Regenerate payee names if accounts are being changed
  let primaryPayee = currentTransaction.payee;
  let linkedPayee = linkedTransaction.payee;

  if (updates.to_account_id || updates.account_id) {
    // Get updated account names
    const fromAccountId = updates.account_id || currentTransaction.account_id;
    const toAccountId = updates.to_account_id || currentTransaction.to_account_id;

    const { data: fromAccount } = await supabase
      .from('accounts')
      .select('name')
      .eq('id', fromAccountId)
      .single();

    const { data: toAccount } = await supabase
      .from('accounts')
      .select('name')
      .eq('id', toAccountId)
      .single();

    if (fromAccount && toAccount) {
      primaryPayee = currentTransaction.type === 'transfer'
        ? `Transfer to ${toAccount.name}`
        : `Payment to ${toAccount.name}`;

      linkedPayee = currentTransaction.type === 'transfer'
        ? `Transfer from ${fromAccount.name}`
        : `Payment from ${fromAccount.name}`;
    }
  }

  // Update the primary transaction (with regenerated payee if accounts changed)
  const primaryUpdates = { ...updates };
  if (updates.to_account_id || updates.account_id) {
    primaryUpdates.payee = primaryPayee;
  }
  const updatedPrimary = await updateTransactionRow(transactionId, primaryUpdates);

  // Prepare updates for the linked transaction
  const linkedUpdates: Record<string, any> = {};
  if (updates.payment_date) linkedUpdates.payment_date = updates.payment_date;
  if (updates.notes !== undefined) linkedUpdates.notes = updates.notes;
  if (updates.amount !== undefined) {
    linkedUpdates.amount = -updates.amount; // Always flip sign for linked transactions
  }
  if (updates.to_account_id) {
    linkedUpdates.account_id = updates.to_account_id;
    linkedUpdates.to_account_id = updates.account_id || currentTransaction.account_id;
  }

  // Set regenerated payee name for linked transaction
  if (updates.to_account_id || updates.account_id) {
    linkedUpdates.payee = linkedPayee;
  }

  // Update the linked transaction
  if (Object.keys(linkedUpdates).length > 0) {
    await updateTransactionRow(linkedTransaction.id, linkedUpdates);
  }

  return updatedPrimary;
}

export const deletingTransactionIds = new Set<number>();

export async function deleteLinkedTransactions(transactionId: number): Promise<boolean> {
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
      .single();

    if (error) {
      console.error(`❌ DELETE LINKED: Error fetching transaction ${transactionId}:`, error);
      throw error;
    }

    if (!currentTransaction.to_account_id ||
        (currentTransaction.type !== 'transfer' && currentTransaction.type !== 'payment')) {
      return deleteRow('transactions', transactionId);
    }

    // Find the linked transaction — prefer deterministic link UUID, fall back to heuristic
    // for older transfers created before transfer_link_id existed.
    const linked = await findLinkedTransaction(currentTransaction as any, 'id', true);
    linkedTransactionId = linked ? linked.id : null;

    if (linkedTransactionId !== null) {
      deletingTransactionIds.add(linkedTransactionId);
      await deleteRow('transactions', linkedTransactionId);
    } else {
      console.warn(`⚠️  DELETE LINKED: No linked transaction found for ${transactionId}, may be orphaned`);
    }

    // Delete the primary transaction
    return deleteRow('transactions', transactionId);
  } finally {
    // Clean up tracking to avoid memory leaks
    deletingTransactionIds.delete(transactionId);
    if (linkedTransactionId !== null) {
      deletingTransactionIds.delete(linkedTransactionId);
    }
  }
}

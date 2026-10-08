import { insertRow, updateRow, deleteRow, deleteRows } from './rows';
import { insertTransaction, updateTransactionRow } from './transaction-rows';
import { deleteLinkedTransactions, updateLinkedTransactions } from './linked-transactions';

// Table-name dispatch. `transactions` needs split-aware and pair-aware handling;
// every other table is a plain row operation.

export async function create(table: string, data: Record<string, any>) {
  if (table === 'transactions') {
    return insertTransaction(data);
  }
  return insertRow(table, data);
}

export async function update(table: string, id: number, data: Record<string, any>) {
  if (table === 'transactions') {
    // Check if this should use linked transaction update
    if (data.type === 'transfer' || data.type === 'payment' || data.to_account_id) {
      return updateLinkedTransactions(id, data);
    }
    return updateTransactionRow(id, data);
  }
  return updateRow(table, id, data);
}

export async function remove(table: string, id: number) {
  if (table === 'transactions') {
    return deleteLinkedTransactions(id);
  }
  return deleteRow(table, id);
}

export async function removeMany(table: string, ids: number[]) {
  if (table === 'transactions') {
    // For transactions, we need to handle linked transactions properly
    // Delete each transaction individually to trigger linked transaction logic
    for (const id of ids) {
      await deleteLinkedTransactions(id);
    }
    return true;
  }
  return deleteRows(table, ids);
}

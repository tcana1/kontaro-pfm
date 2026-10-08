import type { Transaction } from '@shared/schema';

// This utility is no longer needed with the direct mapping approach.
// const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

export const sanitizeTransactionForUpdate = (transaction: Partial<Transaction>): Record<string, any> => {
  const payload: Record<string, any> = {};

  // This function handles both camelCase UI fields and snake_case database fields
  // and filters out computed/view-only fields

  const data = transaction as any;

  // Core transaction fields - handle both camelCase and snake_case
  if (data.accountId !== undefined) payload.account_id = data.accountId;
  if (data.account_id !== undefined) payload.account_id = data.account_id;
  if (data.paymentDate !== undefined) payload.payment_date = data.paymentDate;
  if (data.payment_date !== undefined) payload.payment_date = data.payment_date;
  if (data.purchaseDate !== undefined) payload.purchase_date = data.purchaseDate;
  if (data.purchase_date !== undefined) payload.purchase_date = data.purchase_date;
  if (data.payee !== undefined) payload.payee = data.payee;
  if (data.amount !== undefined) payload.amount = data.amount;
  if (data.type !== undefined) payload.type = data.type;
  
  // Split-related fields (needed for supabaseService split handling)
  if (data.categoryId !== undefined) payload.category_id = data.categoryId;
  if (data.category_id !== undefined) payload.category_id = data.category_id;
  if (data.notes !== undefined) payload.notes = data.notes;
  
  // Optional transaction fields
  if (data.toAccountId !== undefined && data.toAccountId !== null) {
    payload.to_account_id = data.toAccountId;
  }
  if (data.to_account_id !== undefined && data.to_account_id !== null) {
    payload.to_account_id = data.to_account_id;
  }
  
  // Installment fields (exclude is_installment - it's computed)
  if (data.installmentNumber !== undefined && data.installmentNumber !== null) {
    payload.installment_number = data.installmentNumber;
  }
  if (data.installmentTotal !== undefined && data.installmentTotal !== null) {
    payload.installment_total = data.installmentTotal;
  }
  
  // Status and user fields
  if (data.statusId !== undefined) payload.status_id = data.statusId;
  if (data.status_id !== undefined) payload.status_id = data.status_id;
  if (data.userId !== undefined) payload.user_id = data.userId;
  if (data.user_id !== undefined) payload.user_id = data.user_id;
  
  // Boolean flags
  if (data.isIgnored !== undefined) payload.is_ignored = data.isIgnored;
  if (data.is_ignored !== undefined) payload.is_ignored = data.is_ignored;

  // Handle complex status field (might be object with id property)
  if (data.status !== undefined && typeof data.status === 'object' && data.status.id) {
    payload.status_id = data.status.id;
  }

  // Split transaction support — pass through so supabaseService can handle multi-split create/update
  if (data.isSplitTransaction !== undefined) payload.isSplitTransaction = data.isSplitTransaction;
  if (data.splits !== undefined) payload.splits = data.splits;

  // Note: splitId is handled by command layer, don't include in database payload
  // Note: is_installment is computed column, don't include in database payload

  return payload;
};

export const sanitizeSplitForUpdate = (split: Partial<any>): Record<string, any> => {
  const payload: Record<string, any> = {};

  // Convert camelCase UI fields to snake_case database fields
  if (split.id !== undefined) payload.id = split.id;
  if (split.transactionId !== undefined) payload.transaction_id = split.transactionId;
  if (split.categoryId !== undefined) payload.category_id = split.categoryId;
  if (split.amount !== undefined) payload.amount = split.amount;
  
  // UI uses 'notes' but database table uses 'observation'
  if (split.notes !== undefined) payload.observation = split.notes;

  return payload;
};
export type InstallmentError = 'format' | 'range';

export const validateInstallment = (value: string): InstallmentError | null => {
  const match = value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return 'format';
  const current = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  return current < 1 || total < 1 || current > total ? 'range' : null;
};

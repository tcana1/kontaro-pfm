import type { Transaction } from '@shared/schema';
import { tKey } from '@/lib/i18n-keys';

export interface BatchEditRestrictions {
  allowedFields: Set<string>;
  disabledFields: Set<string>;  
  restrictionReasons: Map<string, string>;
  canProceed: boolean;
}

export interface SingleEditRestrictions {
  allowedFields: Set<string>;
  disabledFields: Set<string>;  
  restrictionReasons: Map<string, string>;
  canProceed: boolean;
  isReconciled: boolean;
  canRemoveFromReconciliation: boolean;
}

export class BatchEditValidator {
  static analyzeSelectedTransactions(transactions: Transaction[]): BatchEditRestrictions {
    const restrictions: BatchEditRestrictions = {
      allowedFields: new Set(['notes', 'is_ignored']), // Always safe
      disabledFields: new Set(),
      restrictionReasons: new Map(),
      canProceed: true
    };

    const hasReconciledTransactions = transactions.some(t => (t as any).is_reconciled === true);
    const hasTransfers = transactions.some(t => t.type === 'transfer' || t.type === 'payment');
    const hasLinkedTransactions = transactions.some(t => t.to_account_id != null);
    const hasSplitTransactions = transactions.some(t => (t as any).splitCount >= 2 || ((t as any).splits?.length ?? 0) >= 2);

    if (hasReconciledTransactions) {
      restrictions.disabledFields.add('payment_date');
      restrictions.disabledFields.add('account_id');
      restrictions.restrictionReasons.set('payment_date', tKey('Cannot edit dates on reconciled transactions'));
      restrictions.restrictionReasons.set('account_id', tKey('Cannot edit accounts on reconciled transactions'));
    }

    // Linked transactions should not be batch editable at all
    if (hasLinkedTransactions) {
      restrictions.canProceed = false;
      restrictions.restrictionReasons.set('linked_transactions', tKey('Linked transactions (transfers/payments) cannot be batch edited'));
      return restrictions;
    }

    if (hasTransfers) {
      restrictions.disabledFields.add('account_id');
      restrictions.disabledFields.add('category_id');
      restrictions.restrictionReasons.set('account_id', tKey('Cannot batch edit accounts on transfers'));
      restrictions.restrictionReasons.set('category_id', tKey('Cannot batch edit categories on transfers'));
    }

    if (hasSplitTransactions && !restrictions.disabledFields.has('category_id')) {
      restrictions.disabledFields.add('category_id');
      restrictions.restrictionReasons.set('category_id', tKey('Split transactions have per-split categories — edit them individually'));
    }

    // Add other allowed fields based on restrictions
    const potentialFields = ['payment_date', 'category_id', 'account_id', 'status_id'];
    potentialFields.forEach(field => {
      if (!restrictions.disabledFields.has(field)) {
        restrictions.allowedFields.add(field);
      }
    });

    return restrictions;
  }
}

export class SingleEditValidator {
  static analyzeTransaction(transaction: Transaction): SingleEditRestrictions {
    const restrictions: SingleEditRestrictions = {
      allowedFields: new Set(['notes', 'category_id', 'payee']), // Always safe for reconciled
      disabledFields: new Set(),
      restrictionReasons: new Map(),
      canProceed: true,
      isReconciled: (transaction as any).is_reconciled === true,
      canRemoveFromReconciliation: (transaction as any).is_reconciled === true
    };

    if ((transaction as any).is_reconciled === true) {
      // For reconciled transactions, restrict protected fields only
      // Payee, notes, and category are safe to edit without affecting reconciliation
      const protectedFields = ['payment_date', 'amount', 'account_id'];
      
      protectedFields.forEach(field => {
        restrictions.disabledFields.add(field);
        restrictions.restrictionReasons.set(field, 'Protected field - click "Unlock All Fields" to edit');
      });
    }

    // Handle transfers/payments restrictions (these cannot be unlocked even with de-reconciliation)
    const isTransfer = transaction.type === 'transfer' || transaction.type === 'payment';
    const hasLinkedAccount = transaction.to_account_id != null;
    
    if (isTransfer || hasLinkedAccount) {
      restrictions.disabledFields.add('account_id');
      restrictions.disabledFields.add('category_id'); 
      restrictions.restrictionReasons.set('account_id', 'Cannot edit account on transfers');
      restrictions.restrictionReasons.set('category_id', 'Cannot edit category on transfers');
      
      // These fields cannot be unlocked for transfers
      restrictions.allowedFields.delete('category_id');
    }

    // Add allowed fields (fields not disabled)
    const allFields = ['payment_date', 'payee', 'amount', 'category_id', 'account_id', 'notes'];
    allFields.forEach(field => {
      if (!restrictions.disabledFields.has(field)) {
        restrictions.allowedFields.add(field);
      }
    });

    return restrictions;
  }
}
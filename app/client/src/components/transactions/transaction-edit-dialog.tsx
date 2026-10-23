import React from 'react';
import type { Transaction } from '@shared/schema';
import SingleEditDialog from './single-edit-dialog';
import BatchEditDialog from './batch-edit-dialog';

interface TransactionEditDialogProps {
  isOpen: boolean;
  // 0 entries only when adding; 1 edits that transaction; 2+ edits them in bulk.
  transactions: Transaction[];
  isAdding?: boolean;
  isSaving?: boolean;
  onSave: (original: Transaction | null, data: any) => void;
  onClose: (wasSuccessful?: boolean, failedTransactionIds?: number[]) => void;
  onFailedTransactions?: (failureInfo: { ids: number[]; errors: Map<number, string> }) => void;
}

// Split transactions can't go through the single form (it assumes one split), so they keep using bulk edit.
const isSplitTransaction = (transaction: Transaction) => ((transaction as any).splitCount ?? 0) >= 2;

const TransactionEditDialog: React.FC<TransactionEditDialogProps> = ({
  isOpen,
  transactions,
  isAdding,
  isSaving,
  onSave,
  onClose,
  onFailedTransactions,
}) => {
  const useSingle = !!isAdding || (transactions.length === 1 && !isSplitTransaction(transactions[0]));

  if (useSingle) {
    const transaction = transactions[0] ?? null;
    return (
      <SingleEditDialog
        isOpen={isOpen}
        transaction={transaction as any}
        isAdding={isAdding}
        onSave={(data) => onSave(transaction, data)}
        onCancel={() => onClose(false, [])}
        isSaving={isSaving}
      />
    );
  }

  return (
    <BatchEditDialog
      isOpen={isOpen}
      onClose={onClose}
      selectedTransactions={transactions}
      onFailedTransactions={onFailedTransactions}
    />
  );
};

export default TransactionEditDialog;

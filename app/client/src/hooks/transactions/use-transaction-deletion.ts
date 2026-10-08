import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';
import type { Transaction } from '@shared/schema';
import { CacheUtils } from '@/lib/cacheUtils';
import { DeleteTransactionCommand, BulkDeleteTransactionCommand } from '@/lib/commands/transaction-commands';
import { formatDateForDisplay } from '@/lib/date-utils';

interface UseTransactionDeletionParams {
  selectedTransactions: Transaction[];
  execute: (command: any) => Promise<any>;
  locale: string;
  dateFormat: string;
  onClearSelection: () => void;
}

export function useTransactionDeletion({ selectedTransactions, execute, locale, dateFormat, onClearSelection }: UseTransactionDeletionParams) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isBulkDeleteConfirmation, setIsBulkDeleteConfirmation] = useState(false);
  const [isCheckingReconciliation, setIsCheckingReconciliation] = useState(false);
  const [reconciliationInfo, setReconciliationInfo] = useState<any>(null);

  const handleDeleteTransaction = React.useCallback(async (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setReconciliationInfo(null);

    // Check if this is a reconciled transaction (adjustment or regular reconciled)
    if ((transaction as any).category_id === -2 || (transaction as any).is_reconciled) {
      setIsCheckingReconciliation(true);

      try {
        // Get reconciliation info for this transaction
        const reconciliationData = await supabaseService.rpc('get_reconciliation_info_for_adjustment', {
          p_transaction_id: transaction.id
        });

        setReconciliationInfo(reconciliationData);
      } catch (error) {
        console.error('Error checking reconciliation info:', error);
        // Still show the dialog, just without reconciliation info
        // For regular reconciled transactions, create minimal info to trigger warning
        if ((transaction as any).is_reconciled) {
          setReconciliationInfo({
            is_adjustment: false,
            is_reconciled: true,
            reconciliation_date: null
          });
        }
      } finally {
        setIsCheckingReconciliation(false);
      }
    }

    setIsDeleteDialogOpen(true);
  }, []);

  const handleDeleteSelected = React.useCallback(async () => {
    if (selectedTransactions.length > 0) {
      // 1. Check for starting balance transactions (highest priority - blocks delete)
      const startingBalanceTransactions = selectedTransactions.filter(
        transaction => (transaction as any).category_id === -3
      );

      if (startingBalanceTransactions.length > 0) {
        toast({
          title: t('Cannot delete starting balance transactions'),
          description: t('{{count}} starting balance transaction(s) cannot be deleted. To remove a starting balance, edit the transaction and set the amount to zero instead.', { count: startingBalanceTransactions.length }),
          variant: "destructive",
        });
        return;
      }

      // 2. Check for reconciliation adjustments and reconciled transactions (special dialog)
      const reconciliationAdjustments = selectedTransactions.filter(
        transaction => (transaction as any).category_id === -2
      );

      let reconciledTransactions: Transaction[] = [];

      try {
        const ids = selectedTransactions.map(t => t.id);
        const reconciledIds = new Set(await supabaseService.getReconciledTransactionIds(ids));
        reconciledTransactions = selectedTransactions.filter(t => reconciledIds.has(t.id));
      } catch (error) {
        console.error('Error checking reconciliation status for bulk delete:', error);
      }

      if (reconciliationAdjustments.length > 0 || reconciledTransactions.length > 0) {
        // Show special reconciliation dialog for reconciled/adjustment transactions
        const transactionToCheck = reconciliationAdjustments[0] || reconciledTransactions[0];
        setSelectedTransaction(transactionToCheck);
        setIsCheckingReconciliation(true);

        try {
          const reconciliationData = await supabaseService.rpc('get_reconciliation_info_for_adjustment', {
            p_transaction_id: transactionToCheck.id
          });

          setReconciliationInfo(reconciliationData);
        } catch (error) {
          console.error('Error checking reconciliation info for bulk delete:', error);
          // Still show the dialog, just without reconciliation info
        } finally {
          setIsCheckingReconciliation(false);
        }

        setIsDeleteDialogOpen(true);
        return;
      }

      // 3. Check for bulk delete confirmation (more than 1 transaction)
      if (selectedTransactions.length > 1) {
        // Show basic bulk delete confirmation dialog
        setIsBulkDeleteConfirmation(true);
        setSelectedTransaction(null);
        setReconciliationInfo(null);
        setIsDeleteDialogOpen(true);
        return;
      }

      // 4. Single regular transaction - proceed directly without confirmation
      try {
        const command = new BulkDeleteTransactionCommand(selectedTransactions, queryClient);
        await execute(command);
        toast({
          title: t('Transaction deleted'),
          description: t('The transaction has been successfully deleted.'),
        });
        onClearSelection();
      } catch (error: any) {
        toast({
          title: t('Error'),
          description: t('Failed to delete transaction: {{message}}', { message: error.message || t('Unknown error') }),
          variant: "destructive",
        });
      }
    }
  }, [selectedTransactions, queryClient, toast, execute, t, onClearSelection]);

  const handleConfirmDelete = React.useCallback(async () => {
    // Handle simple bulk delete confirmation
    if (isBulkDeleteConfirmation) {
      try {
        const command = new BulkDeleteTransactionCommand(selectedTransactions, queryClient);
        await execute(command);
        toast({
          title: t('Transactions deleted'),
          description: t('{{count}} transactions have been successfully deleted.', { count: selectedTransactions.length }),
        });
        onClearSelection();
      } catch (error: any) {
        toast({
          title: t('Error'),
          description: t('Failed to delete transactions: {{message}}', { message: error.message || t('Unknown error') }),
          variant: "destructive",
        });
      }
      setIsDeleteDialogOpen(false);
      setIsBulkDeleteConfirmation(false);
      return;
    }

    // Handle complex reconciliation/adjustment cases
    if (selectedTransaction) {
      try {
        // Check if we're in bulk delete mode (multiple selected transactions)
        if (selectedTransactions.length > 1) {
          // Handle bulk delete with reconciliation adjustments and reconciled transactions
          const reconciliationAdjustments = selectedTransactions.filter(
            transaction => (transaction as any).category_id === -2
          );

          const startingBalanceTransactions = selectedTransactions.filter(
            transaction => (transaction as any).category_id === -3
          );

          // Starting balance transactions cannot be deleted even in bulk
          if (startingBalanceTransactions.length > 0) {
            toast({
              title: t('Cannot delete starting balance transactions'),
              description: t('{{count}} starting balance transaction(s) cannot be deleted. To remove a starting balance, edit the transaction and set the amount to zero instead.', { count: startingBalanceTransactions.length }),
              variant: "destructive",
            });
            setIsDeleteDialogOpen(false);
            return;
          }

          // Check for transactions that are reconciled but not adjustments
          let reconciledTransactions: Transaction[] = [];

          try {
            const nonAdjustmentIds = selectedTransactions
              .filter(t => (t as any).category_id !== -2)
              .map(t => t.id);
            const reconciledIds = new Set(await supabaseService.getReconciledTransactionIds(nonAdjustmentIds));
            reconciledTransactions = selectedTransactions.filter(
              t => (t as any).category_id !== -2 && reconciledIds.has(t.id)
            );
          } catch (error) {
            console.error('Error checking reconciliation status during delete:', error);
          }

          if (reconciliationAdjustments.length > 0) {
            // Delete each reconciliation adjustment using the cascade delete function
            for (const adjustment of reconciliationAdjustments) {
              await supabaseService.rpc('delete_reconciliation_adjustment_transaction', {
                p_transaction_id: adjustment.id
              });
            }
          }

          if (reconciledTransactions.length > 0) {
            // Remove reconciled transactions from reconciliations first, then delete them
            for (const reconciledTx of reconciledTransactions) {
              await supabaseService.rpc('remove_transaction_from_all_reconciliations', {
                p_transaction_id: reconciledTx.id
              });
            }
          }

          // Delete remaining regular transactions using bulk delete
          const regularTransactions = selectedTransactions.filter(
            transaction => (transaction as any).category_id !== -2 &&
                          !reconciledTransactions.some(rt => rt.id === transaction.id)
          );

          // Delete all non-adjustment transactions (including previously reconciled ones)
          const transactionsToDelete = [...regularTransactions, ...reconciledTransactions];

          if (transactionsToDelete.length > 0) {
            const command = new BulkDeleteTransactionCommand(transactionsToDelete, queryClient);
            await execute(command);
          }

          // Create appropriate toast message
          let description = t('{{count}} transactions deleted.', { count: selectedTransactions.length });
          if (reconciliationAdjustments.length > 0) {
            description += ` ${t('{{count}} reconciliation adjustment(s) undone.', { count: reconciliationAdjustments.length })}`;
          }
          if (reconciledTransactions.length > 0) {
            description += ` ${t('{{count}} transaction(s) removed from reconciliation(s).', { count: reconciledTransactions.length })}`;
          }

          toast({
            title: t('Transactions deleted'),
            description: description,
          });

          // Clear selected transactions
          onClearSelection();

          // Invalidate queries to refresh the UI
          await CacheUtils.invalidateTransactionRelated(queryClient);
        } else {
          // Single transaction delete (original logic)

          // Check if this is a starting balance transaction
          if ((selectedTransaction as any).category_id === -3) {
            toast({
              title: t('Cannot delete starting balance transaction'),
              description: t('Starting balance transactions cannot be deleted. To remove a starting balance, edit the transaction and set the amount to zero instead.'),
              variant: "destructive",
            });
            setIsDeleteDialogOpen(false);
            return;
          }

          // Check if this is a reconciliation adjustment that needs special handling
          if (reconciliationInfo?.is_adjustment) {
            // Use the cascade delete function for reconciliation adjustments
            const result = await supabaseService.rpc('delete_reconciliation_adjustment_transaction', {
              p_transaction_id: selectedTransaction.id
            });

            toast({
              title: t('Reconciliation Undone'),
              description: t('Reconciliation adjustment deleted and reconciliation from {{date}} has been undone.', { date: formatDateForDisplay(reconciliationInfo.reconciliation_date, locale, dateFormat) }),
            });

            // Invalidate queries to refresh the UI
            await CacheUtils.invalidateTransactionRelated(queryClient);
          } else {
            // Check if this transaction is reconciled (but not an adjustment)
            const isReconciled = await supabaseService.rpc('is_transaction_reconciled', {
              transaction_id: selectedTransaction.id
            });

            if (isReconciled) {
              // Remove from reconciliation first, then delete
              await supabaseService.rpc('remove_transaction_from_all_reconciliations', {
                p_transaction_id: selectedTransaction.id
              });
            }

            // Use normal delete for regular transactions
            const command = new DeleteTransactionCommand(selectedTransaction, queryClient);
            await execute(command);

            // Success toasts only after the DB operation actually succeeded
            if (isReconciled) {
              toast({
                title: t('Transaction deleted'),
                description: t('Transaction removed from reconciliation and deleted.'),
              });
            } else {
              toast({
                title: t('Transaction deleted'),
                description: t('The transaction has been successfully deleted.'),
              });
            }
          }
        }

        setIsDeleteDialogOpen(false);
        setReconciliationInfo(null);
      } catch (error: any) {
        toast({
          title: t('Error'),
          description: t('Failed to delete transaction(s): {{message}}', { message: error.message || t('Unknown error') }),
          variant: "destructive",
        });
      }
    }
  }, [selectedTransaction, selectedTransactions, reconciliationInfo, isBulkDeleteConfirmation, execute, toast, queryClient, t, locale, dateFormat, onClearSelection]);

  const handleDeleteDialogOpenChange = React.useCallback((open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      // Clear states when dialog closes
      setIsBulkDeleteConfirmation(false);
      setSelectedTransaction(null);
      setReconciliationInfo(null);
    }
  }, []);

  return {
    isDeleteDialogOpen,
    selectedTransaction,
    isBulkDeleteConfirmation,
    isCheckingReconciliation,
    reconciliationInfo,
    handleDeleteTransaction,
    handleDeleteSelected,
    handleConfirmDelete,
    handleDeleteDialogOpenChange,
  };
}

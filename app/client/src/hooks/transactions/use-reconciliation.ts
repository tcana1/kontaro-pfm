import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { getTodayISO } from '@/lib/date-utils';

interface UseReconciliationParams {
  accountId?: number;
  userId?: string;
}

export function useReconciliation({ accountId, userId }: UseReconciliationParams) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isReconciling, setIsReconciling] = useState(false);
  const [isMismatchDialogOpen, setIsMismatchDialogOpen] = useState(false);
  const [mismatchData, setMismatchData] = useState<any>(null);
  const [pendingReconciliationParams, setPendingReconciliationParams] = useState<any>(null);
  const [mobileReconcileOpen, setMobileReconcileOpen] = useState(false);

  const proceedWithReconciliation = React.useCallback(async (accountId: number, bankBalance: number, clearedTransactionIds: number[]) => {
    try {
      // Additional validation before database call
      if (typeof bankBalance !== 'number' || isNaN(bankBalance)) {
        throw new Error(`Invalid bank balance for database call: ${bankBalance} (type: ${typeof bankBalance})`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reconciliationResult = await supabaseService.rpc('create_reconciliation', {
        p_account_id: accountId,
        p_reconciliation_date: getTodayISO(),
        p_start_date: '1900-01-01', // TODO: Calculate proper start date
        p_end_date: getTodayISO(),
        p_bank_balance: bankBalance,
        p_transaction_ids: clearedTransactionIds
      });

      if (!reconciliationResult) {
        throw new Error('Reconciliation failed');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = reconciliationResult as any;

      if (result.adjustment_transaction_id) {
        toast({
          title: t('Reconciliation Complete'),
          description: t('Reconciliation completed with a {{amount}} adjustment transaction. {{count}} transactions reconciled.', { amount: Math.abs(result.difference).toFixed(2), count: result.transaction_count }),
        });
      } else {
        toast({
          title: t('Reconciliation Complete'),
          description: t('Perfect match! {{count}} transactions reconciled with no adjustments needed.', { count: result.transaction_count }),
        });
      }

      // Refresh transaction data and account balances (immediate for reconciliation)
      await CacheUtils.invalidateTransactionRelatedImmediate(queryClient);
      await CacheUtils.invalidateAccountRelatedImmediate(queryClient, accountId);
    } finally {
      setIsReconciling(false);
    }
  }, [queryClient, toast, t]);

  const handleReconcile = React.useCallback(async (bankBalance: number) => {
    // Validate bankBalance is a valid number
    if (typeof bankBalance !== 'number' || isNaN(bankBalance)) {
      console.error('❌ Invalid bankBalance:', { bankBalance, type: typeof bankBalance });
      toast({
        title: t('Error'),
        description: t('Invalid bank balance value. Please enter a valid number.'),
        variant: "destructive",
      });
      return;
    }

    if (!accountId || !userId) {
      console.error('❌ Missing accountId or user', { accountId, userId });
      toast({
        title: t('Error'),
        description: t('Account ID or user not available for reconciliation.'),
        variant: "destructive",
      });
      return;
    }

    setIsReconciling(true);

    try {

      // Get ALL cleared transactions for this account using pagination
      let allClearedTransactions: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMoreData = true;

      while (hasMoreData) {
        const batchQuery = await supabaseService.getTransactions({
          filters: {
            accounts: [accountId],
            status: ['Cleared'] // Cleared status by name
          },
          sortBy: 'payment_date',
          sortDirection: 'desc', // Most recent first
          limit: batchSize,
          offset: offset
        });

        if (batchQuery.data && batchQuery.data.length > 0) {
          allClearedTransactions.push(...batchQuery.data);
          offset += batchSize;
          hasMoreData = batchQuery.data.length === batchSize; // Continue if we got a full batch
        } else {
          hasMoreData = false;
        }
      }

      const clearedTransactionsQuery = {
        data: allClearedTransactions,
        count: allClearedTransactions.length
      };


      if (!clearedTransactionsQuery.data) {
        throw new Error('Failed to fetch cleared transactions');
      }

      const clearedTransactionIds = Array.from(new Set(clearedTransactionsQuery.data.map((t: any) => t.transaction_id)));

      // First, check for reconciliation difference
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const differenceCheck = await supabaseService.rpc('check_reconciliation_difference', {
        p_account_id: accountId,
        p_bank_balance: bankBalance,
        p_transaction_ids: clearedTransactionIds
      });

      // If there's a mismatch, show warning dialog
      if ((differenceCheck as any)?.requires_adjustment) {
        setMismatchData(differenceCheck);
        setPendingReconciliationParams({
          accountId,
          bankBalance,
          clearedTransactionIds
        });
        setIsMismatchDialogOpen(true);
        setIsReconciling(false);
        return;
      }

      // No mismatch, proceed directly with reconciliation
      await proceedWithReconciliation(accountId, bankBalance, clearedTransactionIds);

    } catch (error: any) {
      console.error('❌ Reconciliation error:', error);
      console.error('❌ Error stack:', error.stack);
      toast({
        title: t('Reconciliation Failed'),
        description: error.message || t('Unknown error occurred during reconciliation'),
        variant: "destructive",
      });
    } finally {
      setIsReconciling(false);
    }
  }, [accountId, userId, queryClient, toast, t, proceedWithReconciliation]);

  const handleMismatchDialogProceed = React.useCallback(async () => {
    if (!pendingReconciliationParams) return;

    setIsMismatchDialogOpen(false);
    setIsReconciling(true);

    const { accountId, bankBalance, clearedTransactionIds } = pendingReconciliationParams;

    if (typeof bankBalance !== 'number' || isNaN(bankBalance)) {
      console.error('❌ Invalid bankBalance from pending params:', { bankBalance, type: typeof bankBalance });
      toast({
        title: t('Error'),
        description: t('Invalid bank balance value from stored parameters.'),
        variant: "destructive",
      });
      setIsReconciling(false);
      return;
    }

    await proceedWithReconciliation(accountId, bankBalance, clearedTransactionIds);

    // Clear pending data
    setMismatchData(null);
    setPendingReconciliationParams(null);
  }, [pendingReconciliationParams, proceedWithReconciliation, toast, t]);

  const handleMismatchDialogCancel = React.useCallback(() => {
    setIsMismatchDialogOpen(false);
    setMismatchData(null);
    setPendingReconciliationParams(null);
    setIsReconciling(false);
  }, []);

  return {
    isReconciling,
    handleReconcile,
    isMismatchDialogOpen,
    mismatchData,
    mobileReconcileOpen,
    setMobileReconcileOpen,
    handleMismatchDialogProceed,
    handleMismatchDialogCancel,
  };
}

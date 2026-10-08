import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMobileHeader, useMobilePanel } from '@/contexts/mobile-header-context';
import { ChevronDown, X, Scale } from 'lucide-react';
import MobileTransactionFab from '@/components/transactions/mobile-transaction-fab';
import MobileReconcileSheet from '@/components/transactions/mobile-reconcile-sheet';
import { cn } from '@/lib/utils';
import { useSingleAccountBalance } from '@/hooks/useAccountBalance';
import { formatCurrency } from '@/lib/currency-formatter';
import { formatDateForDisplay } from '@/lib/date-utils';
import TransactionTable from '@/components/transactions/transaction-table';
import TransactionStatusBar from '@/components/transactions/transaction-status-bar';
import TransactionControls from '@/components/transactions/transaction-controls';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabaseService } from '@/services/supabase-service';
import type { Transaction } from '@shared/schema';
import { Card } from '@/components/ui/card';
import { CacheUtils } from '@/lib/cacheUtils';
import { useAuth } from '@/contexts/auth-context';
import { useFinance } from '@/contexts/finance-context';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import TransactionFilter, { ActiveFilters } from '@/components/transactions/transaction-filter';
import DateRangeFilter from '@/components/transactions/date-range-filter';
import { useTransactionUrlFilters } from '@/hooks/use-transaction-url-filters';
import { CreateTransactionCommand, UpdateTransactionCommand } from '@/lib/commands/transaction-commands';
import { useHistoryContext } from '@/contexts/history-context';
import BatchEditDialog from '@/components/transactions/batch-edit-dialog';
import BatchTagDialog from '@/components/transactions/batch-tag-dialog';
import CollapseDialog from '@/components/transactions/collapse-dialog';
import ReconciliationMismatchDialog from '@/components/transactions/reconciliation-mismatch-dialog';
import { CreditCardPaymentForm } from '@/components/transactions/credit-card-payment-form';
import { isCreditCard } from '@/utils/transfer-utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTransactionSelection } from '@/hooks/transactions/use-transaction-selection';
import { useTransactionDeletion } from '@/hooks/transactions/use-transaction-deletion';
import { useReconciliation } from '@/hooks/transactions/use-reconciliation';

interface TransactionsPageContentProps {
  accountId?: number;
}

const TransactionsPageContent: React.FC<TransactionsPageContentProps> = ({ accountId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { categories, accounts, currency, locale, dateFormat } = useFinance();
  const { undo, redo, discardAffecting: discardHistoryAffecting, canUndo, canRedo, execute: originalExecute } = useHistoryContext();

  // Default filters - preserve account filter for account-specific pages
  const defaultFilters: ActiveFilters = accountId ? { accounts: [accountId] } : {};
  
  // Use URL filters hook
  const { 
    filters: activeFilters, 
    search, 
    sortBy, 
    sortDirection, 
    updateFilters, 
    updateSearch, 
    updateSort 
  } = useTransactionUrlFilters({
    defaultFilters,
    defaultSearch: ""
  });

  // Update filters when accountId changes (when navigating between account pages)
  useEffect(() => {
    if (accountId) {
      // Use functional update to avoid dependency on activeFilters
      updateFilters(currentFilters => {
        // If account filter is already correct, don't update
        if (currentFilters.accounts?.length === 1 && currentFilters.accounts[0] === accountId) {
          return currentFilters;
        }
        // Preserve other filters but ensure account filter is set
        return { ...currentFilters, accounts: [accountId] };
      });
    }
  }, [accountId, updateFilters]);
  const [isAddingNewTransaction, setIsAddingNewTransaction] = useState(false);
  const [persistedNewTransactionData, setPersistedNewTransactionData] = useState<any>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBatchEditDialogOpen, setIsBatchEditDialogOpen] = useState(false);
  const [isBatchTagDialogOpen, setIsBatchTagDialogOpen] = useState(false);
  const [isCollapseDialogOpen, setIsCollapseDialogOpen] = useState(false);
  const [failedTransactionIds, setFailedTransactionIds] = useState<number[]>([]);
  const [failedTransactionErrors, setFailedTransactionErrors] = useState<Map<number, string>>(new Map());
  const [externalMergeCandidate, setExternalMergeCandidate] = useState<any | null>(null);
  const [externalMergeCandidateCreated, setExternalMergeCandidateCreated] = useState(false);
  const [isRecordPaymentDialogOpen, setIsRecordPaymentDialogOpen] = useState(false);
  
  // Coordinated loading states for synchronized balance and transaction loading
  const [isTransactionTableLoading, setIsTransactionTableLoading] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);
  const [paginationInfo, setPaginationInfo] = useState<{ page: number; pageSize: number; total: number } | undefined>();

  // Show skeletons until both queries complete
  const isAnyLoading = isTransactionTableLoading || isBalanceLoading;
  
  
  // Transaction-specific execute wrapper that clears failed transaction highlights on new CRUD operations
  // but excludes BatchUpdateTransactionCommand to avoid interfering with its highlighting
  const execute = React.useCallback(async (command: any) => {
    // Don't clear failed transaction highlights for batch update commands
    // as they manage their own highlighting state
    if (command.constructor.name !== 'BatchUpdateTransactionCommand') {
      setFailedTransactionIds([]);
      setFailedTransactionErrors(new Map());
    }
    return originalExecute(command);
  }, [originalExecute]);

  const { selectedTransactions, setSelectedTransactions, selectedTotal, selectedIsSplit } = useTransactionSelection();

  const {
    isDeleteDialogOpen,
    selectedTransaction, isBulkDeleteConfirmation,
    isCheckingReconciliation, reconciliationInfo,
    handleDeleteTransaction, handleDeleteSelected, handleConfirmDelete,
    handleDeleteDialogOpenChange,
  } = useTransactionDeletion({
    selectedTransactions,
    execute,
    locale,
    dateFormat,
    onClearSelection: () => setSelectedTransactions([]),
  });

  const {
    isReconciling, handleReconcile,
    isMismatchDialogOpen, mismatchData,
    mobileReconcileOpen, setMobileReconcileOpen,
    handleMismatchDialogProceed, handleMismatchDialogCancel,
  } = useReconciliation({
    accountId,
    userId: user?.id,
  });

  // Wrapper for search changes that also clears failed transaction highlights
  const handleSearchChange = React.useCallback((searchTerm: string) => {
    // Only clear failed highlights if search term actually changed
    if (searchTerm !== search && failedTransactionIds.length > 0) {
      setFailedTransactionIds([]);
      setFailedTransactionErrors(new Map());
    }
    updateSearch(searchTerm);
  }, [search, failedTransactionIds, updateSearch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const undoKeyPressed = isMac ? event.metaKey && event.key === 'z' : event.ctrlKey && event.key === 'z';
      const redoKeyPressed = isMac ? event.metaKey && event.shiftKey && event.key === 'z' : event.ctrlKey && event.key === 'y';

      if (undoKeyPressed) {
        event.preventDefault();
        undo();
      } else if (redoKeyPressed) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

  const handleAddTransactionClick = React.useCallback(() => {
    setIsAddingNewTransaction(true);
  }, []);

  const handleRecordPaymentClick = React.useCallback(() => {
    setIsRecordPaymentDialogOpen(true);
  }, []);

  const handleEdit = React.useCallback((transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
  }, []);



  const handleSaveEditedTransaction = React.useCallback(async (originalTransaction: Transaction, newData: any, onReadyToClose?: () => void) => {
    if (!user) {
      toast({
        title: t('Error'),
        description: t('User not authenticated.'),
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const command = new UpdateTransactionCommand(originalTransaction, newData, queryClient);
      await execute(command);

      if (command.isConversionInProgress()) {
        // Converting to a Payment/Transfer is a real (if now single round-trip)
        // DB operation — keep the row's Save button spinning (isSaving is still
        // true) until it confirms, instead of closing optimistically.
        await command.waitForDatabase();
        setEditingTransactionId(null);
        onReadyToClose?.();
      } else {
        // Close edit mode optimistically (user sees immediate response)
        setEditingTransactionId(null);
        onReadyToClose?.();

        // Wait for database operation and show toast based on actual result
        await command.waitForDatabase();
      }

      // Success: database operation completed
      toast({
        title: t('Transaction updated'),
        description: t('The transaction has been successfully updated.'),
      });
    } catch (error: any) {
      // Failure: database operation failed (cache was reverted by command)
      // Reopen the edit row since changes weren't actually saved
      setEditingTransactionId(originalTransaction.id);

      toast({
        title: t('Error'),
        description: t('Failed to update transaction: {{message}}', { message: error.message || t('Unknown error') }),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [user, queryClient, toast, execute]);

  const handleCancelEditedTransaction = React.useCallback(() => {
    setEditingTransactionId(null);
  }, []);

  const handleBatchEdit = React.useCallback(() => {
    if (selectedTransactions.length > 0) {
      // Clear any previous failed transaction highlights when starting a new batch edit
      setFailedTransactionIds([]);
      setFailedTransactionErrors(new Map());
      setIsBatchEditDialogOpen(true);
    }
  }, [selectedTransactions]);

  const selectionSpansAccounts = React.useCallback(() => {
    const accountIds = new Set(selectedTransactions.map(tx => (tx as any).account_id));
    return accountIds.size > 1;
  }, [selectedTransactions]);

  const handleCollapseSelected = React.useCallback(() => {
    if (selectionSpansAccounts()) {
      toast({ title: t('Error'), description: t('Transactions from different accounts cannot be combined.'), variant: 'destructive' });
      return;
    }
    setIsCollapseDialogOpen(true);
  }, [selectionSpansAccounts, toast]);

  const handleMergeSelected = React.useCallback(async () => {
    if (selectedTransactions.length !== 2) return;
    if (selectionSpansAccounts()) {
      toast({ title: t('Error'), description: t('Transactions from different accounts cannot be merged.'), variant: 'destructive' });
      return;
    }
    const [txA, txB] = selectedTransactions;
    try {
      const { id, created } = await supabaseService.findOrCreateMatchCandidate(txA.id, txB.id);
      const candidate = await supabaseService.getMatchCandidateById(id);
      setExternalMergeCandidateCreated(created);
      setExternalMergeCandidate(candidate);
    } catch (e) {
      toast({ title: t('Error'), description: t('Could not start the merge.'), variant: 'destructive' });
    }
  }, [selectedTransactions, selectionSpansAccounts, toast]);

  const handleCollapse = React.useCallback(async (
    baseId: number,
    otherIds: number[],
    resolvedFields: { payee?: string; payment_date?: string; purchase_date?: string }
  ) => {
    try {
      await supabaseService.collapseTransactions(baseId, otherIds, resolvedFields);
      discardHistoryAffecting([baseId, ...otherIds]);
      setIsCollapseDialogOpen(false);
      setSelectedTransactions([]);
      CacheUtils.invalidateTransactionRelated(queryClient);
      toast({ title: t('Combined'), description: t('{{count}} transactions combined into 1.', { count: otherIds.length + 1 }) });
    } catch (e) {
      console.error('[Collapse] RPC failed:', e);
      toast({ title: t('Error'), description: t('Failed to combine transactions.'), variant: 'destructive' });
    }
  }, [queryClient, toast, discardHistoryAffecting]);

  const handleExplodeSelected = React.useCallback(async () => {
    if (selectedTransactions.length !== 1) return;
    const tx = selectedTransactions[0] as any;
    try {
      await supabaseService.explodeTransaction(tx.id);
      discardHistoryAffecting([tx.id]);
      setSelectedTransactions([]);
      CacheUtils.invalidateTransactionRelated(queryClient);
      toast({ title: t('Exploded'), description: t('Splits separated into individual transactions.') });
    } catch (e) {
      console.error('[Explode] RPC failed:', e);
      toast({ title: t('Error'), description: t('Failed to explode the transaction.'), variant: 'destructive' });
    }
  }, [selectedTransactions, queryClient, toast, discardHistoryAffecting]);

  const handleExternalMergeClose = React.useCallback(async () => {
    if (externalMergeCandidateCreated && externalMergeCandidate) {
      await supabaseService.deleteMatchCandidate(externalMergeCandidate.id);
    }
    setExternalMergeCandidate(null);
    setExternalMergeCandidateCreated(false);
  }, [externalMergeCandidate, externalMergeCandidateCreated]);

  const handleBatchEditClose = React.useCallback((wasSuccessful?: boolean, dialogFailedIds?: number[]) => {
    setIsBatchEditDialogOpen(false);
    
    if (wasSuccessful) {
      // Use the failed IDs passed from the dialog to avoid race condition
      const actualFailedIds = dialogFailedIds || [];
      
      if (actualFailedIds.length > 0) {
        // Partial success: keep only failed transactions selected
        setSelectedTransactions(prev => 
          prev.filter(t => actualFailedIds.includes(t.id))
        );
      } else {
        // Full success: clear all selections and failed highlights
        setSelectedTransactions([]);
        setFailedTransactionIds([]);
        setFailedTransactionErrors(new Map());
      }
    }
  }, []);

  const handleBatchEditFailed = React.useCallback((failureInfo: { ids: number[], errors: Map<number, string> }) => {
    setFailedTransactionIds(failureInfo.ids);
    setFailedTransactionErrors(failureInfo.errors);
  }, []);


  const [isDuplicateTransactionDialogOpen, setIsDuplicateTransactionDialogOpen] = useState(false);
  const [duplicateTransactionData, setDuplicateTransactionData] = useState<any>(null);

  const handleSaveNewTransaction = React.useCallback(async (data: any, force = false) => {
    if (!user) {
      toast({ title: t('Error'), description: t('User not authenticated.'), variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const transactionData = { ...data, userId: user.id };
      const command = new CreateTransactionCommand(transactionData, queryClient, force);
      
      // Immediately close the form and clear state for optimistic UI
      setIsAddingNewTransaction(false);
      setPersistedNewTransactionData(null);
      
      await execute(command);

      toast({ title: t('Transaction added'), description: t('The new transaction has been successfully added.') });
      
      if (isDuplicateTransactionDialogOpen) {
        setIsDuplicateTransactionDialogOpen(false);
        setDuplicateTransactionData(null);
      }
    } catch (error: any) {
      // Restore the form state on error
      setIsAddingNewTransaction(true);
      setPersistedNewTransactionData(data);
      
      if (error.name === 'DuplicateTransactionError') {
        setDuplicateTransactionData(data);
        setIsDuplicateTransactionDialogOpen(true);
        return;
      }
      toast({ title: t('Error'), description: t('Failed to add transaction: {{message}}', { message: error.message || t('Unknown error') }), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [user, queryClient, toast, execute, isDuplicateTransactionDialogOpen]);

  const handleCancelNewTransaction = React.useCallback((data: any) => {
    setPersistedNewTransactionData(data);
    setIsAddingNewTransaction(false);
  }, []);

  const handleApplyFilters = async (filters: ActiveFilters) => {
    // Preserve account filter if viewing account-specific page
    const updatedFilters = accountId 
      ? { ...filters, accounts: [accountId] }
      : filters;
    updateFilters(updatedFilters);
    // Clear failed transaction highlights when filters change
    setFailedTransactionIds([]);
    setFailedTransactionErrors(new Map());
    await CacheUtils.invalidateTransactionRelated(queryClient);
  };

  const handleClearAllFilters = React.useCallback(async () => {
    // Preserve account filter if viewing account-specific page
    const clearedFilters = accountId ? { accounts: [accountId] } : {};
    updateFilters(clearedFilters);
    updateSearch("");
    // Clear failed transaction highlights when clearing filters
    setFailedTransactionIds([]);
    setFailedTransactionErrors(new Map());
    await CacheUtils.invalidateTransactionRelated(queryClient);
  }, [queryClient, accountId, updateFilters, updateSearch]);

  // Count for Advanced Filter only (status, categories, accounts)
  // Exclude automatically applied account filter from count
  const advancedFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilters.status?.length) count += activeFilters.status.length;
    if (activeFilters.categories?.length) count += activeFilters.categories.length;
    if (activeFilters.ignored?.length) count += activeFilters.ignored.length;
    if (activeFilters.tags?.length) count += activeFilters.tags.length;
    // Only count account filters if not on account-specific page, or if there are additional accounts selected
    if (activeFilters.accounts?.length) {
      if (!accountId) {
        // Regular transactions page - count all account filters
        count += activeFilters.accounts.length;
      } else {
        // Account-specific page - only count if there are additional accounts beyond the current one
        const additionalAccounts = activeFilters.accounts.filter(id => id !== accountId);
        count += additionalAccounts.length;
      }
    }
    return count;
  }, [activeFilters, accountId]);

  // Count for all filters including date range
  const totalActiveFilterCount = useMemo(() => {
    let count = advancedFilterCount;
    if (activeFilters.dateRange?.from) count += 1;
    return count;
  }, [advancedFilterCount, activeFilters.dateRange]);

  const isAnyFilterActive = totalActiveFilterCount > 0 || search.length > 0;

  // Find account name for display and determine if we should show Record Payment button
  const isMobile = useIsMobile();
  const currentAccount = accountId ? accounts?.find(account => account.id === accountId) : null;
  const shouldShowRecordPaymentButton = currentAccount ? isCreditCard(currentAccount) : false;

  const [mobileBalanceOpen, setMobileBalanceOpen] = useState(false);

  // Balance data for the expandable mobile header panel (account-specific pages only)
  const { data: mobileBalance } = useSingleAccountBalance(accountId ?? 0, { enabled: !!accountId });

  const balanceColor = currentAccount
    ? (currentAccount.type_id === 2 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400')
    : 'text-gray-900 dark:text-gray-100';

  useMobileHeader(() => (
    <div className="flex items-center flex-1 min-w-0 gap-2">
      <button
        onClick={() => accountId && setMobileBalanceOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 min-w-0 text-left py-1',
          !accountId && 'cursor-default',
        )}
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {currentAccount?.name ?? t('All Accounts')}
        </span>
        {accountId && (
          <ChevronDown className={cn(
            'h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-200',
            mobileBalanceOpen && 'rotate-180',
          )} />
        )}
      </button>
      {selectedTransactions.length > 0 ? (
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 tabular-nums">
            {selectedTransactions.length} · {formatCurrency(Math.abs(selectedTotal), currency)}
          </span>
          <button
            onClick={() => setSelectedTransactions([])}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : accountId ? (
        <button
          onClick={() => setMobileReconcileOpen(true)}
          className="ml-auto flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('Reconcile account')}
        >
          <Scale className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  ), [currentAccount?.name, accountId, mobileBalanceOpen, selectedTransactions.length, selectedTotal, currency, mobileReconcileOpen]);

  useMobilePanel(() => {
    if (!accountId || !mobileBalanceOpen) return null;
    const items = [
      { label: t('Cleared'), value: mobileBalance?.clearedBalance },
      { label: t('Pending'), value: mobileBalance?.pendingBalance },
      { label: t('Total'),   value: mobileBalance?.totalBalance },
    ];
    return (
      <div className="flex justify-around">
        {items.map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
            {value !== undefined ? (
              <span className={cn('text-sm font-semibold tabular-nums', balanceColor)}>
                {formatCurrency(value, currency)}
              </span>
            ) : (
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            )}
          </div>
        ))}
      </div>
    );
  }, [accountId, mobileBalanceOpen, mobileBalance, balanceColor, currency]);

  return (
    <div className="flex-1 flex flex-col space-y-4 bg-gray-100 dark:bg-gray-900 relative">
      {/* Loading overlay during reconciliation */}
      {isReconciling && (
        <div className="fixed inset-0 bg-black bg-opacity-20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
            <div>
              <div className="font-medium text-gray-900">{t('Processing Reconciliation')}</div>
              <div className="text-sm text-gray-600">{t('Please wait while we process your reconciliation...')}</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-sm max-w-full p-0">
        {/* Sticky wrapper for controls and table header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800">
          <TransactionControls
            search={search}
            onSearchChange={handleSearchChange}
            onAddTransactionClick={handleAddTransactionClick}
            onFilterClick={() => {}}
            selectedCount={selectedTransactions.length}
            onDeleteSelected={handleDeleteSelected}
            onBatchEdit={handleBatchEdit}
            onBatchTag={() => setIsBatchTagDialogOpen(true)}
            onCollapseSelected={handleCollapseSelected}
            onExplodeSelected={handleExplodeSelected}
            onMergeSelected={handleMergeSelected}
            selectedIsSplit={selectedIsSplit}
            onClearAllFilters={handleClearAllFilters}
            isAnyFilterActive={isAnyFilterActive}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            showRecordPaymentButton={shouldShowRecordPaymentButton}
            onRecordPaymentClick={handleRecordPaymentClick}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={updateSort}
          >
            <DateRangeFilter
              activeFilters={activeFilters}
              onApplyFilters={handleApplyFilters}
            />
            <TransactionFilter
              activeFilters={activeFilters}
              onApplyFilters={handleApplyFilters}
              activeFilterCount={advancedFilterCount}
            />
          </TransactionControls>
        </div>

        <TransactionTable
          search={search}
          filters={activeFilters}
          onEditTransaction={handleEdit}
          onDeleteTransaction={handleDeleteTransaction}
          selectedTransactions={selectedTransactions}
          onSelectionChange={setSelectedTransactions}
          isAddingNewTransaction={isAddingNewTransaction}
          onSaveNewTransaction={handleSaveNewTransaction}
          onCancelNewTransaction={handleCancelNewTransaction}
          persistedNewTransactionData={persistedNewTransactionData}
          editingTransactionId={editingTransactionId}
          onSaveEditedTransaction={handleSaveEditedTransaction}
          onCancelEditedTransaction={handleCancelEditedTransaction}
          isSaving={isSaving}
          failedTransactionIds={failedTransactionIds}
          failedTransactionErrors={failedTransactionErrors}
          currentAccountId={accountId}
          initialSortBy={sortBy}
          initialSortDirection={sortDirection}
          onSortChange={updateSort}
          onLoadingStateChange={setIsTransactionTableLoading}
          onPaginationInfoChange={setPaginationInfo}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={setItemsPerPage}
          forceShowSkeleton={isAnyLoading}
          onMobileDeleteSelected={handleDeleteSelected}
          onMobileBatchEdit={handleBatchEdit}
          onMobileBatchTag={() => setIsBatchTagDialogOpen(true)}
          onMobileCollapse={handleCollapseSelected}
          onMobileExplode={handleExplodeSelected}
          externalMergeCandidate={externalMergeCandidate}
          onExternalMergeClose={handleExternalMergeClose}
        />

        {/* Desktop only — mobile shows balances and selection in the header panel */}
        {!isMobile && (
          <TransactionStatusBar
            selectedTotal={selectedTotal}
            selectedCount={selectedTransactions.length}
            accountId={accountId}
            onReconcile={handleReconcile}
            isReconciling={isReconciling}
            forceShowSkeleton={isAnyLoading}
            onBalanceLoadingStateChange={setIsBalanceLoading}
            pagination={paginationInfo}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={setItemsPerPage}
            isPaginationDisabled={isAddingNewTransaction || !!editingTransactionId}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBulkDeleteConfirmation ? t('Confirm Bulk Deletion') :
               reconciliationInfo?.is_adjustment ? t('Undo Reconciliation') :
               reconciliationInfo ? t('Delete Reconciled Transaction') : t('Confirm Deletion')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBulkDeleteConfirmation ? (
                t('Are you sure you want to delete {{count}} transactions? This action cannot be undone.', { count: selectedTransactions.length })
              ) : reconciliationInfo?.is_adjustment ? (
                <div className="space-y-2">
                  <p>
                    {t('This is a reconciliation adjustment transaction created on {{date}}.', {
                      date: reconciliationInfo.reconciliation_date
                        ? formatDateForDisplay(reconciliationInfo.reconciliation_date, locale, dateFormat)
                        : t('unknown date'),
                    })}
                  </p>
                  <p className="font-semibold text-amber-600">
                    {t('Deleting it will undo the entire reconciliation, removing the reconciled status from all transactions that were part of this reconciliation.')}
                  </p>
                  <p>{t('Are you sure you want to proceed?')}</p>
                </div>
              ) : reconciliationInfo ? (
                <div className="space-y-2">
                  <p className="font-semibold text-orange-600">
                    {t('This transaction is part of a completed reconciliation.')}
                  </p>
                  <p>
                    {t('Deleting it will remove the transaction from its reconciliation and may affect your account balance accuracy.')}
                  </p>
                  <p>{t('Are you sure you want to delete this reconciled transaction?')}</p>
                </div>
              ) : (
                t('Are you sure you want to delete this transaction? This action cannot be undone.')
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className={reconciliationInfo?.is_adjustment ?
                "bg-amber-500 hover:bg-amber-600" :
                reconciliationInfo ?
                "bg-orange-500 hover:bg-orange-600" :
                "bg-red-500 hover:bg-red-600"
              }
              disabled={isCheckingReconciliation}
            >
              {isCheckingReconciliation ? t('Checking...') :
               isBulkDeleteConfirmation ? t('Delete All') :
               reconciliationInfo?.is_adjustment ? t('Undo Reconciliation') :
               reconciliationInfo ? t('Delete Reconciled') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Transaction Confirmation Dialog */}
      <AlertDialog
        open={isDuplicateTransactionDialogOpen}
        onOpenChange={setIsDuplicateTransactionDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Duplicate Transaction')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('A transaction with the same date, payee, and amount already exists. Are you sure you want to add this one?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateTransactionData(null)}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSaveNewTransaction(duplicateTransactionData, true)}>
              {t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Edit Dialog */}
      <BatchEditDialog
        isOpen={isBatchEditDialogOpen}
        onClose={handleBatchEditClose}
        selectedTransactions={selectedTransactions}
        onFailedTransactions={handleBatchEditFailed}
      />

      {/* Batch Tag Dialog */}
      <BatchTagDialog
        open={isBatchTagDialogOpen}
        onClose={() => setIsBatchTagDialogOpen(false)}
        onApplied={() => setSelectedTransactions([])}
        selectedTransactions={selectedTransactions}
      />

      {/* Collapse Dialog */}
      <CollapseDialog
        open={isCollapseDialogOpen}
        transactions={selectedTransactions}
        onClose={() => setIsCollapseDialogOpen(false)}
        onCollapse={handleCollapse}
      />

      {/* Reconciliation Mismatch Dialog */}
      {mismatchData && (
        <ReconciliationMismatchDialog
          isOpen={isMismatchDialogOpen}
          onClose={handleMismatchDialogCancel}
          onProceed={handleMismatchDialogProceed}
          calculatedBalance={mismatchData.calculated_balance}
          bankBalance={mismatchData.bank_balance}
          difference={mismatchData.difference}
          transactionCount={mismatchData.transaction_count}
          currency={currency || 'USD'}
        />
      )}

      {/* Mobile reconcile sheet */}
      <MobileReconcileSheet
        open={mobileReconcileOpen}
        onClose={() => setMobileReconcileOpen(false)}
        onReconcile={handleReconcile}
        isReconciling={isReconciling}
      />

      {/* Mobile FAB — add transaction (no selection) or bulk actions (with selection) */}
      <MobileTransactionFab
        hasSelection={selectedTransactions.length > 0}
        selectedCount={selectedTransactions.length}
        selectedIsSplit={selectedIsSplit}
        onAdd={handleAddTransactionClick}
        onBatchEdit={handleBatchEdit}
        onBatchTag={() => setIsBatchTagDialogOpen(true)}
        onCollapseSelected={handleCollapseSelected}
        onExplodeSelected={handleExplodeSelected}
        onMergeSelected={handleMergeSelected}
        onDeleteSelected={handleDeleteSelected}
      />

      {/* Record Payment Dialog */}
      <Dialog open={isRecordPaymentDialogOpen} onOpenChange={setIsRecordPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t('Record Credit Card Payment')}</DialogTitle>
          </DialogHeader>
          {currentAccount && user && (
            <CreditCardPaymentForm
              account={currentAccount}
              userId={user.id}
              specialCategoryId={-4} // Transfer/Payment category
              onSuccess={() => {
                setIsRecordPaymentDialogOpen(false);
                CacheUtils.invalidateTransactionRelated(queryClient);
              }}
              onCancel={() => setIsRecordPaymentDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionsPageContent;

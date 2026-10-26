import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { groupSplits } from './transaction-table-utils';
import { TransactionPagination } from './transaction-pagination';
import { TableHeaders } from './transaction-table-headers';
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import {
  Edit,
  Layers,
  Trash2,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  EyeOff,
  CreditCard,
  Tag,
  Clock,
  CheckCircle2,
  MinusCircle,
  ChevronsLeft,
  ChevronsRight,
  Check,

} from "lucide-react";
import { Button } from "@/components/ui/button";

import { formatDateForDisplay } from "@/lib/date-utils";
import { useFinance } from "@/contexts/finance-context";
import { useToast } from "@/hooks/use-toast";
import { useHistoryContext } from "@/contexts/history-context";
import { UpdateTransactionStatusCommand } from "@/lib/commands/transaction-commands";
import { CacheUtils } from '@/lib/cacheUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import type { Account, Category, Transaction } from "@shared/schema";
import { supabaseService } from "@/services/supabase-service";
import { Checkbox } from "@/components/ui/checkbox";
import EditableTransactionRow from './editable-transaction-row';
import TransactionRowDisplay from './transaction-row-display';
import SplitRow from './split-row';
import TransactionSkeleton from './transaction-skeleton';
import ReconciliationWarningDialog from './reconciliation-warning-dialog';
import { ActiveFilters } from "./transaction-filter";
import MobileTransactionCard from './mobile-transaction-card';
import TransactionEditDialog from './transaction-edit-dialog';
import MobileTagSheet from './mobile-tag-sheet';
import TagDetail from '@/components/tags/tag-detail';
import { MergeTransactionDialog, type MatchCandidate } from './merge-transaction-dialog';

// Extend the shared schema Transaction type with our UI-specific fields
interface TransactionWithUIFields extends Transaction {
  // Fields from the v_transaction_splits view
  account_name: string;
  category_name: string;
  category_group_name: string;
  category_group_emoji: string;
  is_income: boolean;
  split_amount: number;
  split_observation: string;
  to_account_name: string;
  status_name: string;
  status_id: number;
  is_reconciled: boolean;
  split_id: number;
  // Calculated fields
  paymentDate?: string | Date;
}

// One entry per unique transaction, with all its splits collected
interface GroupedTransaction extends Omit<TransactionWithUIFields, 'splits'> {
  splits: TransactionWithUIFields[];
  splitCount: number;
  totalAmount: string;
}

interface TransactionTableProps {
  limit?: number;
  showPagination?: boolean;
  showActions?: boolean;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transaction: Transaction) => void;
  selectedTransactions: Transaction[];
  onSelectionChange: (transactions: Transaction[]) => void;
  isAddingNewTransaction: boolean;
  onSaveNewTransaction: (data: any) => void;
  onCancelNewTransaction: (data?: any) => void;
  persistedNewTransactionData: any;
  editingTransactionId: number | null;
  onSaveEditedTransaction: (originalTransaction: Transaction, newData: any, onReadyToClose?: () => void) => void;
  onCancelEditedTransaction: () => void;
  search: string;
  isSaving: boolean;
  filters: ActiveFilters;
  failedTransactionIds?: number[];
  failedTransactionErrors?: Map<number, string>;
  currentAccountId?: number;
  initialSortBy?: string;
  initialSortDirection?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortDirection: 'asc' | 'desc') => void;
  onLoadingStateChange?: (isLoading: boolean) => void;
  onPaginationInfoChange?: (info: { page: number; pageSize: number; total: number }) => void;
  itemsPerPage?: number; // Controlled page size; falls back to internal state when omitted
  onItemsPerPageChange?: (value: number) => void;
  forceShowSkeleton?: boolean; // Force skeleton state for coordinated loading
  onMobileDeleteSelected?: () => void;
  onMobileBatchEdit?: () => void;
  onMobileBatchTag?: () => void;
  onMobileCollapse?: () => void;
  onMobileExplode?: () => void;
  externalMergeCandidate?: MatchCandidate | null;
  onExternalMergeClose?: () => void;
}

const TransactionTable: React.FC<TransactionTableProps> = React.memo(({
  limit,
  showPagination = true,
  showActions = true,
  onEditTransaction,
  onDeleteTransaction,
  selectedTransactions,
  onSelectionChange,
  isAddingNewTransaction,
  onSaveNewTransaction,
  onCancelNewTransaction,
  persistedNewTransactionData,
  editingTransactionId,
  onSaveEditedTransaction,
  onCancelEditedTransaction,
  search,
  isSaving,
  filters,
  failedTransactionIds = [],
  failedTransactionErrors = new Map(),
  currentAccountId,
  initialSortBy = 'payment_date',
  initialSortDirection = 'desc',
  onSortChange,
  onLoadingStateChange,
  onPaginationInfoChange,
  itemsPerPage: itemsPerPageProp,
  onItemsPerPageChange,
  forceShowSkeleton = false,
  onMobileDeleteSelected,
  onMobileBatchEdit,
  onMobileBatchTag,
  onMobileCollapse,
  onMobileExplode,
  externalMergeCandidate,
  onExternalMergeClose,
}) => {
  
  // Open merge dialog when a manual merge candidate is passed from the parent
  React.useEffect(() => {
    if (externalMergeCandidate) setMergeDialogCandidate(externalMergeCandidate);
  }, [externalMergeCandidate]);


  // Sync with URL sort changes
  React.useEffect(() => {
    setSortField(initialSortBy);
    setSortDirection(initialSortDirection);
  }, [initialSortBy, initialSortDirection]);

  // Helper function to handle sort changes
  const handleSortChange = (newSortField: string, defaultDirection: 'asc' | 'desc' = 'asc') => {
    if (!isAddingNewTransaction) {
      let newDirection: 'asc' | 'desc';
      
      if (sortField === newSortField) {
        // Toggle direction if same field
        newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        // Use default direction for new field
        newDirection = defaultDirection;
      }
      
      setSortField(newSortField);
      setSortDirection(newDirection);
      
      // Call the URL update callback
      if (onSortChange) {
        onSortChange(newSortField, newDirection);
      }
    }
  };
  
  const { t } = useTranslation();
  const { currency, accounts, categories, categoryGroups, locale, dateFormat } =
    useFinance();
  const { user } = useAuth();

  const [page, setPage] = useState(1);

  const [sortField, setSortField] = useState<string>(initialSortBy);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(initialSortDirection);
  const [internalItemsPerPage, setInternalItemsPerPage] = useState<number>(50);
  const itemsPerPage = itemsPerPageProp ?? internalItemsPerPage;
  const setItemsPerPage = onItemsPerPageChange ?? setInternalItemsPerPage;
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<Set<number>>(new Set());
  const [mobileEditTransaction, setMobileEditTransaction] = useState<GroupedTransaction | null>(null);
  const [mobileTagDetail, setMobileTagDetail] = useState<{ id: number; name: string; color: string } | null>(null);
  const [mobileTagPickerTx, setMobileTagPickerTx] = useState<{ id: number; tagId: number | null } | null>(null);
  const isMobile = useIsMobile();

  // Match candidates state
  const [matchCandidateMap, setMatchCandidateMap] = useState<Map<number, MatchCandidate>>(new Map());
  const [mergeDialogCandidate, setMergeDialogCandidate] = useState<MatchCandidate | null>(null);

  // Reconciliation warning dialog state
  const [reconciliationWarning, setReconciliationWarning] = useState<{
    isOpen: boolean;
    transactionId: number;
    oldStatusId: number;
    newStatusId: number;
    warningType: 'status' | 'edit';
  }>({
    isOpen: false,
    transactionId: 0,
    oldStatusId: 0,
    newStatusId: 0,
    warningType: 'status'
  });

  const pageSize = itemsPerPage;
  const offset = (page - 1) * pageSize;

  const queryClient = useQueryClient();
  const { execute, discardAffecting: discardHistoryAffecting } = useHistoryContext();
  const { toast } = useToast();

  const handleStatusChange = async (transactionId: number, oldStatusId: number, newStatusId: number) => {
    if (!user) {
      toast({ title: t('Error'), description: t('User not authenticated.'), variant: "destructive" });
      return;
    }

    // Check if transaction is reconciled
    const transaction = transactions.find(txn => txn.id === transactionId);
    if (transaction?.is_reconciled) {
      // Show warning dialog
      setReconciliationWarning({
        isOpen: true,
        transactionId,
        oldStatusId,
        newStatusId,
        warningType: 'status'
      });
      return;
    }

    // Proceed with status change
    await performStatusChange(transactionId, oldStatusId, newStatusId);
  };

  const performStatusChange = async (transactionId: number, oldStatusId: number, newStatusId: number) => {
    if (!user) return;
    try {
      const command = new UpdateTransactionStatusCommand(
        transactionId,
        oldStatusId,
        newStatusId,
        user.id,
        queryClient
      );
      await execute(command);
      toast({ title: t('Success'), description: t('Transaction status updated.') });
    } catch (error) {
      toast({ title: t('Error'), description: t('Failed to update status.'), variant: "destructive" });
    }
  };

  const handleIgnoreToggle = async (transactionId: number, currentIgnoreState: boolean) => {
    if (!user) {
      toast({ title: t('Error'), description: t('User not authenticated.'), variant: "destructive" });
      return;
    }

    try {
      await supabaseService.update('transactions', transactionId, {
        is_ignored: !currentIgnoreState
      });
      
      // Refresh the transactions
      await CacheUtils.invalidateTransactionRelated(queryClient);
    } catch (error) {
      toast({ title: t('Error'), description: t('Failed to update ignore status.'), variant: "destructive" });
    }
  };

  const handleReconciliationWarningClose = () => {
    setReconciliationWarning(prev => ({ ...prev, isOpen: false }));
  };

  const handleReconciliationWarningProceed = async () => {
    const { transactionId, oldStatusId, newStatusId, warningType } = reconciliationWarning;
    
    try {
      // First remove the transaction from all reconciliations
      await supabaseService.rpc('remove_transaction_from_all_reconciliations', {
        p_transaction_id: transactionId
      });

      if (warningType === 'status') {
        // Then proceed with the status change
        await performStatusChange(transactionId, oldStatusId, newStatusId);
        
        toast({
          title: t('Transaction Updated'),
          description: t('Transaction removed from reconciliation and status updated.'),
        });
      } else {
        // For edit warnings, just proceed with normal edit
        const transaction = transactions.find(txn => txn.id === transactionId);
        if (transaction) {
          onEditTransaction(transaction as unknown as Transaction);
        }

        toast({
          title: t('Transaction Removed from Reconciliation'),
          description: t('You can now edit this transaction.'),
        });
      }
    } catch (error: any) {
      toast({
        title: t('Error'),
        description: error.message || t('Failed to update reconciled transaction.'),
        variant: "destructive"
      });
    }
    
    handleReconciliationWarningClose();
  };

  const handleReconciledEdit = (transaction: Transaction) => {
    // Use normal edit flow - our new inline editing handles reconciliation restrictions
    onEditTransaction(transaction);
  };

  const getCategoryById = (id: number): Category | undefined => {
    const category = categories.find((cat) => cat.id === id);
    if (!category) {
      console.warn(`Category not found for ID: ${id}`);
    }
    return category;
  };

  const getAccountById = (id: number): Account | undefined => {
    const account = accounts.find((acc) => acc.id === id);
    if (!account) {
      console.warn(`Account not found for ID: ${id}`);
    }
    return account;
  };

  const getCategoryGroupById = (id: number) => {
    return categoryGroups.find((group) => group.id === id);
  };

  const {
    data: transactionData,
    isLoading,
  } = useServiceQuery("transactions", {
    filters: {
      ...filters,
      ...(search && { search: search }),
      user_id: user?.id,
    },
    limit: itemsPerPage,
    offset: (page - 1) * itemsPerPage,
    sortBy: sortField,
    sortDirection: sortDirection,
    // Currency only affects search parsing; keeping it out of the key otherwise
    // avoids a duplicate fetch when settings flip the default USD to the real one.
    currency: search ? currency : undefined,
  });

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingStateChange?.(isLoading);
  }, [isLoading, onLoadingStateChange]);

  // Load match candidates and build a transactionId → candidate map.
  // Key off a stable string of row ids rather than the transactionData object
  // itself — the query returns a fresh object each render, so depending on it
  // directly re-fires this effect on every render (infinite loop).
  const matchScanKey = (transactionData?.data ?? [])
    .map((r: any) => r.id)
    .join(',');
  const hasTransactionData = transactionData !== undefined;
  useEffect(() => {
    if (!hasTransactionData) return;
    // Guard against a stale response overwriting newer data when paginating fast
    let ignore = false;
    supabaseService.getPendingMatchCandidates()
      .then(candidates => {
        if (ignore) return;
        const map = new Map<number, MatchCandidate>();
        (candidates ?? []).forEach(c => {
          const candidate = c as unknown as MatchCandidate;
          map.set(candidate.transaction_a.id, candidate);
          map.set(candidate.transaction_b.id, candidate);
        });
        setMatchCandidateMap(map);
      })
      .catch(() => {/* silent — match indicator is non-critical */});
    return () => { ignore = true; };
  }, [matchScanKey, hasTransactionData]);

  const handleMerge = async (
    winnerId: number,
    loserId: number,
    resolvedFields: Parameters<typeof supabaseService.mergeTransactions>[2],
    matchCandidateId: number,
    splitSource?: 'winner' | 'loser'
  ) => {
    try {
      await supabaseService.mergeTransactions(winnerId, loserId, resolvedFields, matchCandidateId, splitSource);
      discardHistoryAffecting([winnerId, loserId]);
      setMergeDialogCandidate(null);
      setMatchCandidateMap(prev => {
        const next = new Map(prev);
        next.delete(winnerId);
        next.delete(loserId);
        return next;
      });
      CacheUtils.invalidateTransactionRelated(queryClient);
      onSelectionChange([]);
      toast({ title: t('Merge complete'), description: t('Transactions merged successfully.') });
    } catch (err) {
      toast({ title: t('Failed to merge transactions'), description: String(err), variant: 'destructive' });
    }
  };

const handleDismissMatch = async (matchCandidateId: number) => {
    await supabaseService.dismissMatch(matchCandidateId);
    setMergeDialogCandidate(null);
    if (mergeDialogCandidate) {
      setMatchCandidateMap(prev => {
        const next = new Map(prev);
        next.delete(mergeDialogCandidate.transaction_a.id);
        next.delete(mergeDialogCandidate.transaction_b.id);
        return next;
      });
    }
  };

  // Group raw view rows (one per split) into one GroupedTransaction per unique transaction ID
  const groupedTransactions = useMemo<GroupedTransaction[]>(() => {
    const rawRows: TransactionWithUIFields[] = transactionData?.data || [];
    return groupSplits(rawRows) as unknown as GroupedTransaction[];
  }, [transactionData]);

  const transactions = useMemo<GroupedTransaction[]>(() => {
    if (!search) return groupedTransactions;

    const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const normalizedSearch = normalize(search);

    return groupedTransactions.filter((gt) => {
      if (gt.payee && normalize(gt.payee).includes(normalizedSearch)) return true;
      if (gt.account_name && normalize(gt.account_name).includes(normalizedSearch)) return true;
      // Search across all splits for category / notes
      if (gt.splits.some(s => s.category_name && normalize(s.category_name).includes(normalizedSearch))) return true;
      if (gt.splits.some(s => s.category_group_name && normalize(s.category_group_name).includes(normalizedSearch))) return true;
      if (gt.splits.some(s => s.split_observation && normalize(s.split_observation).includes(normalizedSearch))) return true;
      if (gt.tag_name && normalize(gt.tag_name).includes(normalizedSearch)) return true;
      // Amount search
      const total = parseFloat(gt.totalAmount);
      if (!isNaN(total)) {
        const absTotal = Math.abs(total);
        const searchNum = parseFloat(normalizedSearch);
        if (!isNaN(searchNum) && Math.floor(absTotal) === Math.floor(Math.abs(searchNum))) return true;
      }
      return false;
    });
  }, [groupedTransactions, search]);

  const handleToggleExpand = (transactionId: number) => {
    setExpandedTransactions(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  };

  // Auto-expand split transactions when entering edit mode
  useEffect(() => {
    if (editingTransactionId) {
      const tx = transactions.find(t => t.id === editingTransactionId);
      if (tx && tx.splitCount >= 2) {
        setExpandedTransactions(prev => new Set(prev).add(editingTransactionId));
      }
    }
  }, [editingTransactionId]);

  useEffect(() => {
    setPage(1);
  }, [itemsPerPage]);

  // When the filter set or search term changes, the result set is sized
  // differently — always return to page 1 so the query never requests an
  // offset that no longer exists (PostgREST would otherwise fail with PGRST103
  // "Requested range not satisfiable" instead of returning empty rows).
  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  // Scroll the main container (desktop) and the document (mobile) back to top on page change
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  

  const allTransactions = { count: transactionData?.count || 0 };

  const totalPages = Math.max(1, Math.ceil(allTransactions.count / pageSize));

  useEffect(() => {
    onPaginationInfoChange?.({ page, pageSize, total: allTransactions.count });
  }, [page, pageSize, allTransactions.count, onPaginationInfoChange]);

  useEffect(() => {
    // Only reset page if we have actually loaded data (not just initial state)
    // and the current page exceeds the actual total pages
    if (transactionData && page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [totalPages, transactionData, page]); // Include transactionData to check if data has loaded

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(transactions as unknown as Transaction[]);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectTransaction = (transaction: Transaction, checked: boolean, event?: React.MouseEvent) => {
    const currentIndex = transactions.findIndex(t => t.id === transaction.id);
    
    // Handle shift-click range selection
    if (event?.shiftKey && lastSelectedIndex !== null && lastSelectedIndex !== currentIndex) {
      const startIndex = Math.min(lastSelectedIndex, currentIndex);
      const endIndex = Math.max(lastSelectedIndex, currentIndex);
      const rangeTransactions = transactions.slice(startIndex, endIndex + 1);
      
      if (checked) {
        // Add all transactions in range that aren't already selected
        const newSelections = rangeTransactions.filter(t => 
          !selectedTransactions.some(selected => selected.id === t.id)
        );
        onSelectionChange([...selectedTransactions, ...newSelections] as unknown as Transaction[]);
      } else {
        // Remove all transactions in range
        const rangeIds = rangeTransactions.map(t => t.id);
        onSelectionChange(selectedTransactions.filter(t => !rangeIds.includes(t.id)));
      }
    } else {
      // Regular single selection
      if (checked) {
        onSelectionChange([...selectedTransactions, transaction]);
      } else {
        onSelectionChange(selectedTransactions.filter((t) => t.id !== transaction.id));
      }
    }
    
    // Update last selected index
    setLastSelectedIndex(currentIndex);
  };

  const isAllSelected = transactions.length > 0 && selectedTransactions.length === transactions.length;
  const isIndeterminate = selectedTransactions.length > 0 && selectedTransactions.length < transactions.length;

  if (isLoading || forceShowSkeleton) {
    return (
      <>
        {/* Mobile loading: simple card placeholders, no desktop table headers */}
        <div className="md:hidden flex flex-col gap-2 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
              <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="w-32 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="w-20 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse shrink-0" />
            </div>
          ))}
        </div>

        {/* Desktop loading: table skeleton with headers */}
        <div className="hidden md:block">
        <table className="w-full table-fixed">
          <TableHeaders
            isAllSelected={false}
            isIndeterminate={false}
            onSelectAll={() => {}}
            isSelectDisabled
          />
          <tbody>
            <TransactionSkeleton rows={5} />
          </tbody>
        </table>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Mobile card list ─────────────────────────────────────────────────── */}
      <div className="md:hidden">
        {transactions.length === 0 && !isAddingNewTransaction ? (
          <p className="text-center text-sm text-gray-500 py-6">{t('No transactions found')}</p>
        ) : (
          transactions.map((transaction: GroupedTransaction) => (
            <MobileTransactionCard
              key={`mobile-${transaction.id}`}
              transaction={transaction}
              handleStatusChange={handleStatusChange}
              handleIgnoreToggle={handleIgnoreToggle}
              onEditTransaction={() => setMobileEditTransaction(transaction)}
              onDeleteTransaction={() => onDeleteTransaction(transaction as unknown as Transaction)}
              onTagClick={(id, name, color) => setMobileTagDetail({ id, name, color })}
              onTagEdit={() => setMobileTagPickerTx({ id: transaction.id, tagId: transaction.tag_id ?? null })}
              showActions={showActions}
              isSelectionMode={selectedTransactions.length > 0}
              isSelected={selectedTransactions.some(t => t.id === transaction.id)}
              onLongPress={() => handleSelectTransaction(transaction as unknown as Transaction, true)}
              onSelect={() => handleSelectTransaction(transaction as unknown as Transaction, !selectedTransactions.some(t => t.id === transaction.id))}
            />
          ))
        )}
      </div>

      {/* ── Desktop table ─────────────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <table className="w-full table-fixed">
          <TableHeaders
            isAllSelected={isAllSelected}
            isIndeterminate={isIndeterminate}
            onSelectAll={handleSelectAll}
            isSelectDisabled={isAddingNewTransaction}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            editingTransactionId={editingTransactionId}
          />
          <tbody>
            {isAddingNewTransaction && (
              <EditableTransactionRow
                isNew
                transaction={persistedNewTransactionData}
                onSave={onSaveNewTransaction}
                onCancel={onCancelNewTransaction}
                isSaving={isSaving}
                currentAccountId={currentAccountId}
              />
            )}
            {transactions.length === 0 && !isAddingNewTransaction && !editingTransactionId ? (
              <tr>
                <td
                  colSpan={showActions ? 10 : 9}
                  className="text-center py-4"
                >
                  {t('No transactions found')}
                </td>
              </tr>
            ) : (
              transactions.map((transaction: GroupedTransaction) => {
                const rowKey = `transaction-${transaction.id}`;
                const isExpanded = expandedTransactions.has(transaction.id);

                const mainRow = editingTransactionId === transaction.id ? (
                  <EditableTransactionRow
                    key={rowKey}
                    transaction={{
                      ...transaction,
                      amount: transaction.totalAmount,
                      splits: transaction.splits as any,
                    } as any}
                    onSave={(newData) => onSaveEditedTransaction(transaction as unknown as Transaction, newData)}
                    onCancel={onCancelEditedTransaction}
                    showActions={showActions}
                    isSaving={isSaving}
                  />
                ) : (
                  <TransactionRowDisplay
                    key={rowKey}
                    transaction={transaction as any}
                    splits={transaction.splits}
                    totalAmount={transaction.totalAmount}
                    splitCount={transaction.splitCount}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                    onEditTransaction={onEditTransaction}
                    onDeleteTransaction={onDeleteTransaction}
                    handleSelectTransaction={handleSelectTransaction}
                    isSelected={selectedTransactions.some((t) => t.id === transaction.id)}
                    handleStatusChange={handleStatusChange}
                    handleIgnoreToggle={handleIgnoreToggle}
                    showActions={showActions}
                    hasBatchEditFailed={failedTransactionIds.includes(transaction.id)}
                    failedTransactionError={failedTransactionErrors.get(transaction.id)}
                    onReconciledEdit={handleReconciledEdit}
                    matchCandidateId={matchCandidateMap.get(transaction.id)?.id}
                    onMergeClick={async () => {
                      const cached = matchCandidateMap.get(transaction.id);
                      if (!cached) return;
                      const fresh = await supabaseService.getMatchCandidateById(cached.id);
                      setMergeDialogCandidate(fresh as unknown as MatchCandidate ?? null);
                    }}
                  />
                );

                const splitRows = isExpanded && transaction.splitCount >= 2 && editingTransactionId !== transaction.id
                  ? [
                      ...transaction.splits.map((split, index) => (
                        <SplitRow
                          key={`split-${transaction.id}-${split.split_id ?? index}`}
                          split={split}
                          onDoubleClick={() => onEditTransaction(transaction as unknown as Transaction)}
                        />
                      )),
                    ]
                  : [];

                return [mainRow, ...splitRows];
              }).flat()
            )}
          </tbody>
        </table>
      </div>

      <TransactionPagination
        showNavigation={showPagination && totalPages > 1 && !isAddingNewTransaction}
        page={page}
        totalPages={totalPages}
        isDisabled={isAddingNewTransaction || !!editingTransactionId}
        onPageChange={setPage}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={setItemsPerPage}
      />

      {/* Reconciliation Warning Dialog */}
      <ReconciliationWarningDialog
        isOpen={reconciliationWarning.isOpen}
        onClose={handleReconciliationWarningClose}
        onProceed={handleReconciliationWarningProceed}
        transactionId={reconciliationWarning.transactionId}
        warningType={reconciliationWarning.warningType}
      />

      <MergeTransactionDialog
        candidate={mergeDialogCandidate}
        open={!!mergeDialogCandidate}
        onClose={() => { setMergeDialogCandidate(null); onExternalMergeClose?.(); }}
        onMerge={handleMerge}
        onDismiss={handleDismissMatch}
      />

      {/* Mobile edit/add dialog */}
      <TransactionEditDialog
        isOpen={!!mobileEditTransaction || (isMobile && isAddingNewTransaction)}
        transactions={mobileEditTransaction ? [mobileEditTransaction as unknown as Transaction] : []}
        isAdding={isMobile && isAddingNewTransaction}
        onSave={(_original, data) => {
          if (isAddingNewTransaction) {
            onSaveNewTransaction(data);
          } else if (mobileEditTransaction) {
            // Sheet closes when the caller signals it's safe to (instantly for
            // regular edits, only after DB confirmation for conversions) —
            // mirrors the desktop row's editingTransactionId timing instead of
            // closing unconditionally before the save even settles.
            onSaveEditedTransaction(mobileEditTransaction as unknown as Transaction, data, () => {
              setMobileEditTransaction(null);
            });
          }
        }}
        onClose={() => {
          if (isAddingNewTransaction) {
            onCancelNewTransaction();
          } else {
            setMobileEditTransaction(null);
          }
        }}
        isSaving={isSaving}
      />

      {/* Mobile tag picker sheet */}
      <MobileTagSheet
        transactionId={mobileTagPickerTx?.id ?? null}
        currentTagId={mobileTagPickerTx?.tagId ?? null}
        onClose={() => setMobileTagPickerTx(null)}
      />

      {/* Mobile tag detail sheet */}
      {mobileTagDetail && (
        <TagDetail
          tagId={mobileTagDetail.id}
          tagName={mobileTagDetail.name}
          tagColor={mobileTagDetail.color}
          onClose={() => setMobileTagDetail(null)}
        />
      )}

    </>
  );
});

export default TransactionTable;
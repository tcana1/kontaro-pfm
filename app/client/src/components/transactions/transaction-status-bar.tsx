import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency-formatter';
import { useSingleAccountBalance } from '@/hooks/useAccountBalance';
import { useFinance } from '@/contexts/finance-context';
import { cn } from '@/lib/utils';
import { LocaleAmountInput } from '@/components/ui/locale-amount-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TransactionStatusBarProps {
  selectedTotal: number;
  selectedCount: number;
  accountId?: number;
  onReconcile?: (bankBalance: number) => Promise<void>;
  isReconciling?: boolean;
  forceShowSkeleton?: boolean; // Force skeleton state for coordinated loading
  onBalanceLoadingStateChange?: (isLoading: boolean) => void; // Notify parent of balance loading state
  pagination?: { page: number; pageSize: number; total: number };
  itemsPerPage?: number;
  onItemsPerPageChange?: (value: number) => void;
  isPaginationDisabled?: boolean;
}

const getBalanceTextColor = (accountTypeId: number) => {
  switch (accountTypeId) {
    case 1: // checking
    case 3: // tracking
      return 'text-green-600 dark:text-green-400';
    case 2: // credit_card
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};

const TransactionStatusBar: React.FC<TransactionStatusBarProps> = ({
  selectedTotal,
  selectedCount,
  accountId,
  onReconcile,
  isReconciling = false,
  forceShowSkeleton = false,
  onBalanceLoadingStateChange,
  pagination,
  itemsPerPage,
  onItemsPerPageChange,
  isPaginationDisabled = false,
}) => {
  const { t } = useTranslation();
  const { currency, accounts, locale } = useFinance();
  const [showReconcileInput, setShowReconcileInput] = useState(false);
  const [bankBalance, setBankBalance] = useState<string>('');

  // Skip the query when there is no accountId
  const { data: accountBalance, isLoading: isBalanceQueryLoading } = useSingleAccountBalance(accountId || 0);
  const account = accountId ? accounts?.find(acc => acc.id === accountId) : null;

  useEffect(() => {
    onBalanceLoadingStateChange?.(isBalanceQueryLoading);
  }, [isBalanceQueryLoading, onBalanceLoadingStateChange]);

  const handleReconcileSubmit = async () => {
    if (!onReconcile || !bankBalance) return;

    try {
      const numericBalance = parseFloat(bankBalance);

      if (isNaN(numericBalance)) {
        console.error('Invalid bank balance value:', bankBalance);
        throw new Error('Please enter a valid numeric value for bank balance');
      }

      await onReconcile(numericBalance);
      setShowReconcileInput(false);
      setBankBalance('');
    } catch (error) {
      // Error handling will be done by parent component
      console.error('Reconciliation failed:', error);
    }
  };

  const handleReconcileCancel = () => {
    setShowReconcileInput(false);
    setBankBalance('');
  };

  const balancesReady = !!accountBalance && !!account && !forceShowSkeleton;

  const balanceItems = [
    { label: t('Cleared'), value: accountBalance?.clearedBalance },
    { label: t('Pending'), value: accountBalance?.pendingBalance },
    { label: t('Total'), value: accountBalance?.totalBalance },
  ];

  return (
    <div className="mt-auto sticky bottom-0 z-10 flex items-center justify-between gap-4 px-4 py-1.5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-[0_-1px_3px_rgba(0,0,0,0.06)] text-sm">
      <div className="flex items-center gap-x-4 gap-y-1 min-w-0 flex-wrap">
        {accountId && (
          <div className="flex items-center gap-2 shrink-0">
            {balanceItems.map(({ label, value }, index) => (
              <React.Fragment key={label}>
                {index > 0 && (
                  <span className="text-gray-400 dark:text-gray-500 font-bold">{index === 1 ? '+' : '='}</span>
                )}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                  {balancesReady && value !== undefined && account ? (
                    <span className={cn('font-semibold tabular-nums', getBalanceTextColor(account.type_id))}>
                      {formatCurrency(value, currency)}
                    </span>
                  ) : (
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse self-center" />
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {selectedCount > 0 && (
          <div className="shrink-0 whitespace-nowrap font-semibold text-white bg-blue-600 dark:bg-blue-500 px-3 py-1 rounded-md shadow-sm tabular-nums">
            {t('Selected: {{amount}} ({{count}})', { count: selectedCount, amount: formatCurrency(selectedTotal, currency) })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {accountId && onReconcile && (
          <div className="flex items-center gap-2 shrink-0">
            {!showReconcileInput ? (
              <Button
                onClick={() => setShowReconcileInput(true)}
                variant="outline"
                size="sm"
                className="h-7 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                {t('Reconcile')}
              </Button>
            ) : (
              <>
                <div className="w-36">
                  <LocaleAmountInput
                    value={bankBalance}
                    onChange={setBankBalance}
                    placeholder={t('Bank Balance')}
                    title={t('Bank Balance')}
                    className="text-sm px-2 py-1 h-7"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && bankBalance) {
                        handleReconcileSubmit();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleReconcileSubmit}
                  size="sm"
                  disabled={!bankBalance || isReconciling}
                  className="h-7 bg-green-600 hover:bg-green-700 text-white"
                >
                  {isReconciling ? (
                    <div className="flex items-center gap-1">
                      <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                      <span className="text-xs">{t('Processing...')}</span>
                    </div>
                  ) : (
                    '✓'
                  )}
                </Button>
                <Button
                  onClick={handleReconcileCancel}
                  variant="outline"
                  size="sm"
                  disabled={isReconciling}
                  className="h-7"
                >
                  ✕
                </Button>
              </>
            )}
          </div>
        )}
        {pagination && (
          <div className="hidden lg:block text-xs text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
            {t('Showing {{from}}-{{to}} of {{total}} transactions', {
              from: (pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0).toLocaleString(locale),
              to: Math.min(pagination.page * pagination.pageSize, pagination.total).toLocaleString(locale),
              total: pagination.total.toLocaleString(locale),
            })}
          </div>
        )}

        {itemsPerPage !== undefined && onItemsPerPageChange && (
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
            <Select
              value={String(itemsPerPage)}
              onValueChange={(value) => onItemsPerPageChange(Number(value))}
              disabled={isPaginationDisabled}
            >
              <SelectTrigger className="h-7 w-[68px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 250, 500].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{t('per page')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionStatusBar;

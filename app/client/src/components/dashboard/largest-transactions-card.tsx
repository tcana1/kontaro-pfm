
import React, { useState } from 'react';
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from 'react-i18next';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';
import { openTransactionDrilldown } from '@/utils/drilldown-utils';

interface Props {
  selectedMonth: Date;
}

interface LargestTransaction {
  transaction_id: number;
  payment_date: string;
  payee: string;
  amount: number;
  categories: string | null;
  tag: string | null;
  installment: string | null;
  observation: string | null;
}

const COLLAPSED = 3;
const EXPANDED = 8;

export default function LargestTransactionsCard({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const { currency } = useFinance();
  const monthKey = format(selectedMonth, 'yyyy-MM');
  const [expanded, setExpanded] = useState(false);

  const { data = [], isLoading } = useServiceQuery<LargestTransaction[]>(
    ['get_largest_transactions', monthKey],
    {
      rawQuery: true,
      queryParams: {
        p_start: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'),
        p_end: format(endOfMonth(selectedMonth), 'yyyy-MM-dd'),
        p_limit: EXPANDED,
      },
    }
  );

  const all = data ?? [];
  const items = all.slice(0, expanded ? EXPANDED : COLLAPSED);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        {t('Largest Transactions')}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
          {t('No transactions this month')}
        </p>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div
              key={item.transaction_id}
              className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer touch-manipulation hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              title={t('Double-click to view transactions')}
              {...bindDoubleTap(() => openTransactionDrilldown({
                month: monthKey,
                search: item.payee,
                sortBy: 'amount',
                sortDirection: 'asc',
              }))}
            >
              <div className="flex-1 min-w-0">
                <span className="block text-sm text-gray-700 dark:text-gray-300 truncate">
                  {item.payee}
                  {item.installment && (
                    <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{item.installment}</span>
                  )}
                </span>
                {item.categories && (
                  <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{item.categories}</span>
                )}
              </div>
              <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300 flex-shrink-0 text-right">
                {formatCurrency(item.amount, currency, 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('Biggest outflows this month · double-click to drill down')}
          </p>
          {all.length > COLLAPSED && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex-shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {expanded ? t('Show less') : t('Show more')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useMoney } from '@/hooks/useMoney';
import { openTransactionDrilldown } from '@/utils/drilldown-utils';

interface Props {
  selectedMonth: Date;
}

interface NewMerchant {
  payee: string;
  net: number;
  count: number;
  categories: string | null;
  installment_total: number | null;
}

const COLLAPSED = 3;
const EXPANDED = 8;

export default function NewMerchantsCard({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const money = useMoney();
  const monthKey = format(selectedMonth, 'yyyy-MM');
  const [expanded, setExpanded] = useState(false);

  const { data = [], isLoading } = useServiceQuery<NewMerchant[]>(
    ['get_new_merchants', monthKey],
    {
      rawQuery: true,
      queryParams: {
        p_month: format(selectedMonth, 'yyyy-MM-dd'),
        p_lookback_months: 12,
      },
    }
  );

  const all = data ?? [];
  const items = all.slice(0, expanded ? EXPANDED : COLLAPSED);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        {t('New Merchants')}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
          {t('No new merchants this month')}
        </p>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div
              key={item.payee}
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
                  {item.installment_total && item.installment_total > 0 && (
                    <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{item.installment_total}x</span>
                  )}
                </span>
                {item.categories && (
                  <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{item.categories}</span>
                )}
              </div>
              <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-gray-300 flex-shrink-0 text-right">
                {money(item.net, { precision: 0 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('No activity in the prior 12 months · double-click to drill down')}
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

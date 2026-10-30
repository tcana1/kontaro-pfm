import React from 'react';
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useMoney } from '@/hooks/useMoney';
import { openTransactionDrilldown } from '@/utils/drilldown-utils';

interface Props {
  selectedMonth: Date;
}

interface SurpriseItem {
  category_id: number;
  category_name: string;
  color: string;
  current_net: number;
  baseline_net: number;
  deviation_pct: number;
  tier: 'high' | 'medium' | 'low';
}

function sortOptionB(items: SurpriseItem[]): SurpriseItem[] {
  return [...items].sort((a, b) => {
    const aPos = a.deviation_pct >= 0;
    const bPos = b.deviation_pct >= 0;
    if (aPos !== bPos) return aPos ? -1 : 1;
    return Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct);
  });
}

export default function SurprisesCard({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const money = useMoney();
  const monthKey = format(selectedMonth, 'yyyy-MM');

  const { data = [], isLoading } = useServiceQuery<SurpriseItem[]>(
    ['get_dashboard_surprises', monthKey],
    {
      rawQuery: true,
      queryParams: { p_month: format(selectedMonth, 'yyyy-MM-dd') },
    }
  );

  const items = sortOptionB(data ?? []).slice(0, 6);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        {t('Surprises')}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
          {t('No significant deviations this month')}
        </p>
      ) : (
        <div className="space-y-1">
          {items.map(item => {
            const isUp     = item.deviation_pct >= 0;
            const pct      = Math.abs(item.deviation_pct * 100);
            const pctLabel = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();
            const delta    = item.current_net - item.baseline_net;
            const colorCls = isUp
              ? item.tier === 'high'
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-500 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400';

            return (
              <div
                key={item.category_id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer touch-manipulation hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                title={t('Double-click to view transactions')}
                {...bindDoubleTap(() => openTransactionDrilldown({
                  month: monthKey,
                  categoryId: item.category_id,
                  sortBy: 'amount',
                  sortDirection: 'asc',
                }))}
              >
                {/* Name */}
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">
                  {item.category_name}
                </span>

                {/* Current net */}
                <span className="text-sm tabular-nums text-gray-600 dark:text-gray-400 flex-shrink-0 text-right w-16">
                  {money(item.current_net, { precision: 0, compact: true })}
                </span>

                {/* Delta */}
                <span className={`text-sm tabular-nums font-medium flex-shrink-0 text-right w-16 ${colorCls}`}>
                  {isUp ? '+' : ''}{money(delta, { precision: 0, compact: true })}
                </span>

                {/* Arrow + % */}
                <span className={`text-sm font-semibold tabular-nums flex-shrink-0 text-right w-16 ${colorCls}`}>
                  {isUp ? '↑' : '↓'} {pctLabel}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          {t('vs trailing 3-month avg · min baseline R$500 · double-click to drill down')}
        </p>
      )}
    </div>
  );
}

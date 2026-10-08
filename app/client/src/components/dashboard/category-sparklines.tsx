
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import { format, parseISO } from 'date-fns';
import { Link } from 'wouter';
import { BarChart, Bar, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';
import { openTransactionDrilldown } from '@/utils/drilldown-utils';

const DEFAULT_VISIBLE = 5;

interface Props {
  selectedMonth: Date;
}

interface TrendRow {
  category_id: number;
  category_name: string;
  color: string;
  month: string;     // YYYY-MM
  net: number;
  current_net: number;
}

interface CategoryEntry {
  category_id: number;
  category_name: string;
  color: string;
  current_net: number;
  months: { month: string; net: number }[];
}

function trendBadge(months: { net: number }[], currentNet: number): { label: string; cls: string } {
  const prior = months.slice(0, -1).map(m => m.net);
  if (prior.length === 0) return { label: '→', cls: 'text-gray-400' };
  const avg = prior.reduce((s, v) => s + v, 0) / prior.length;
  if (avg === 0) return { label: '→', cls: 'text-gray-400' };
  const pct = (currentNet - avg) / avg;
  if (pct > 0.1) return { label: '↑', cls: 'text-amber-500' };
  if (pct < -0.1) return { label: '↓', cls: 'text-emerald-500' };
  return { label: '→', cls: 'text-gray-400' };
}

interface SparklineProps {
  months: { month: string; net: number }[];
  color: string;
  currentMonth: string;
  currency: any;
  onBarClick: (month: string) => void;
}

function SparklineTooltip({ active, payload, currency }: any) {
  const dateLocale = useDateFnsLocale();
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { month: string; net: number } | undefined;
  if (!d) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-xs shadow-md pointer-events-none">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">
        {format(parseISO(d.month + '-01'), 'MMM yy', { locale: dateLocale })}
      </p>
      <p className="tabular-nums text-gray-600 dark:text-gray-400">
        {formatCurrency(d.net, currency, 0)}
      </p>
    </div>
  );
}

function Sparkline({ months, color, currentMonth, currency, onBarClick }: SparklineProps) {
  return (
    <ResponsiveContainer width={200} height={32}>
      <BarChart data={months} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Tooltip
          content={(props: any) => <SparklineTooltip {...props} currency={currency} />}
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
        />
        <Bar
          dataKey="net"
          radius={[1, 1, 0, 0]}
          onClick={(barData: any) => onBarClick(barData.month)}
          style={{ cursor: 'pointer' }}
        >
          {months.map((m, i) => (
            <Cell
              key={i}
              fill={m.month === currentMonth ? color : `${color}55`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function CategorySparklines({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const { currency } = useFinance();
  const monthKey = format(selectedMonth, 'yyyy-MM');
  const [showAll, setShowAll] = useState(false);

  const { data = [], isLoading } = useServiceQuery<TrendRow[]>(
    ['get_dashboard_category_trends', monthKey],
    {
      rawQuery: true,
      queryParams: {
        p_month: format(selectedMonth, 'yyyy-MM-dd'),
        p_limit: 10,
      },
    }
  );

  const categories = useMemo<CategoryEntry[]>(() => {
    const map = new Map<number, CategoryEntry>();
    for (const row of (data ?? [])) {
      if (!map.has(row.category_id)) {
        map.set(row.category_id, {
          category_id: row.category_id,
          category_name: row.category_name,
          color: row.color,
          current_net: row.current_net,
          months: [],
        });
      }
      map.get(row.category_id)!.months.push({ month: row.month, net: row.net });
    }
    return Array.from(map.values()).sort((a, b) => b.current_net - a.current_net);
  }, [data]);

  const visible   = showAll ? categories : categories.slice(0, DEFAULT_VISIBLE);
  const remaining = categories.length - DEFAULT_VISIBLE;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {t('Top Categories')}
        </p>
        <Link href="/reports">
          <span className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 cursor-pointer">
            {t('View all →')}
          </span>
        </Link>
      </div>

      {isLoading ? (
        <div className="px-5 pb-5 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-gray-400 dark:text-gray-500 text-center py-6">
          {t('No data for this month')}
        </p>
      ) : (
        <>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {visible.map(cat => {
              const badge = trendBadge(cat.months, cat.current_net);
              return (
                <div
                  key={cat.category_id}
                  className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  title={t('Double-click to view transactions')}
                  onDoubleClick={() => openTransactionDrilldown({
                    month: monthKey,
                    categoryId: cat.category_id,
                    sortBy: 'amount',
                    sortDirection: 'asc',
                  })}
                >
                  {/* Dot + name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {cat.category_name}
                    </span>
                  </div>

                  {/* Sparkline — click on individual bars drills into that month */}
                  <div
                    className="flex-shrink-0 hidden sm:block"
                    onDoubleClick={e => e.stopPropagation()}
                  >
                    <Sparkline
                      months={cat.months}
                      color={cat.color}
                      currentMonth={monthKey}
                      currency={currency}
                      onBarClick={(barMonth) => openTransactionDrilldown({
                        month: barMonth,
                        categoryId: cat.category_id,
                        sortBy: 'amount',
                        sortDirection: 'asc',
                      })}
                    />
                  </div>

                  {/* Trend badge */}
                  <span className={`text-base font-semibold flex-shrink-0 w-4 text-center ${badge.cls}`}>
                    {badge.label}
                  </span>

                  {/* Current month net */}
                  <span className="text-sm tabular-nums text-gray-800 dark:text-gray-200 flex-shrink-0 w-24 text-right font-medium">
                    {formatCurrency(cat.current_net, currency, 0)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Show more / less toggle */}
          {remaining > 0 && (
            <div className="px-5 py-3 border-t border-gray-50 dark:border-gray-700/50">
              <button
                onClick={() => setShowAll(v => !v)}
                className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 transition-colors"
              >
                {showAll ? t('↑ Show less') : t('+ {{count}} more', { count: remaining })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

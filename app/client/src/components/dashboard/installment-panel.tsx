import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import type { Locale } from 'date-fns';
import { format, addMonths } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useMoney } from '@/hooks/useMoney';
import { useFinance } from '@/contexts/finance-context';
import { ChartTooltip } from '@/components/ui/chart-tooltip';

interface Props {
  selectedMonth: Date;
}

interface InstallmentSeries {
  payee: string;
  purchase_date: string;
  installment_total: number;
  paid: number;
  remaining: number;
  monthly_amount: number;
  // This month's installment is on the still-open card bill and not reported yet,
  // so paid/remaining are one month behind.
  is_due_this_month?: boolean;
}

interface MonthEvent {
  payee: string;
  purchase_date: string;
  installment_total: number;
  monthly_amount: number;
  // Inferred: the last installment is on the open bill, not stored yet.
  projected?: boolean;
}

interface InstallmentData {
  active: InstallmentSeries[];
  ending_this_month: MonthEvent[];
  starting_this_month: MonthEvent[];
}

interface TimelineEntry {
  month: string;
  label: string;
  total: number;
}

function shortK(val: number): string {
  if (val === 0) return '';
  return `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`;
}

export function buildTimeline(active: InstallmentSeries[], fromMonth: Date, dateLocale: Locale): TimelineEntry[] {
  const buckets: Record<string, number> = {};
  for (const series of active) {
    // A series still owing this month's installment starts here, not next month.
    const first = series.is_due_this_month ? 0 : 1;
    for (let i = 0; i < series.remaining; i++) {
      const key = format(addMonths(fromMonth, first + i), 'yyyy-MM');
      buckets[key] = (buckets[key] ?? 0) + series.monthly_amount;
    }
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = addMonths(fromMonth, i + 1);
    const key = format(d, 'yyyy-MM');
    return { month: key, label: format(d, 'MMM yy', { locale: dateLocale }), total: Math.round((buckets[key] ?? 0) * 100) / 100 };
  });
}

// The panel shows whole units, and rounding each line on its own makes the visible
// lines disagree with the section total (sum of roundings != rounding of the sum).
// Largest remainder instead: floor every line, then hand the leftover units to the
// biggest fractions, so the lines always add up to the total displayed above them.
function apportion(values: number[], total: number): number[] {
  const out = values.map(Math.floor);
  let leftover = Math.round(total) - out.reduce((sum, v) => sum + v, 0);
  const byFraction = values
    .map((v, i) => ({ i, fraction: v - Math.floor(v) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (const { i } of byFraction) {
    if (leftover <= 0) break;
    out[i] += 1;
    leftover -= 1;
  }
  return out;
}

interface ExpandableSectionProps {
  label: string;
  items: Array<MonthEvent & { remaining?: number; paid?: number }>;
  total: number;
  totalSuffix?: string;
  showInstallmentCount?: boolean;
  showProgress?: boolean;
}

function ExpandableSection({ label, items, total, totalSuffix, showInstallmentCount, showProgress }: ExpandableSectionProps) {
  const { t } = useTranslation();
  const money = useMoney();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const displayAmounts = apportion(items.map(i => i.monthly_amount), total);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-left group"
      >
        <div className="flex items-center gap-1">
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          }
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        </div>
        <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
          {money(total, { precision: 0 })}{totalSuffix}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 ml-5 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {item.payee}
                {item.projected && (
                  <span
                    className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500"
                    title={t('Last installment is on the open card bill, not reported by the bank yet')}
                  >
                    {t('Projected')}
                  </span>
                )}
              </span>
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
                {showProgress && item.paid != null && item.installment_total > 0
                  ? <><span className="text-gray-400 dark:text-gray-500 mr-1.5">{item.paid}/{item.installment_total}</span>{money(displayAmounts[i], { precision: 0 })}</>
                  : showInstallmentCount && item.installment_total > 0
                  ? `${item.installment_total}x ${money(displayAmounts[i], { precision: 0 })}`
                  : money(displayAmounts[i], { precision: 0 })
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InstallmentPanel({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const money = useMoney();
  const { showInstallmentProjection } = useFinance();
  const monthKey = format(selectedMonth, 'yyyy-MM');

  const { data, isLoading } = useServiceQuery<InstallmentData>(
    ['get_dashboard_installments', monthKey],
    {
      rawQuery: true,
      queryParams: { p_month: format(selectedMonth, 'yyyy-MM-dd') },
    }
  );

  const active   = data?.active           ?? [];
  // Presentation only: with the projection off, only endings the bank reported show.
  const ending   = (data?.ending_this_month ?? []).filter(e => showInstallmentProjection || !e.projected);
  const starting = data?.starting_this_month ?? [];

  const totalActive    = active.reduce((s, a) => s + a.monthly_amount, 0);
  const totalFreed     = ending.reduce((s, e) => s + e.monthly_amount, 0);
  const totalNewBurden = starting.reduce((s, e) => s + e.monthly_amount, 0);
  // What leaves next month is exactly what ends this month. What starts next month
  // does not exist yet, and what started this month is already in this month's base.
  const netBurdenChange = -totalFreed;


  const timeline = buildTimeline(active, selectedMonth, dateLocale);
  const maxTimeline = Math.max(...timeline.map(t => t.total), 1);

  const isEmpty = active.length === 0 && ending.length === 0 && starting.length === 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        {t('Installments')}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
          {t('No active installments')}
        </p>
      ) : (
        <>
          <div className="space-y-3 mb-5">
            {active.length > 0 && (
              <ExpandableSection
                label={t('Active ({{count}} series)', { count: active.length })}
                items={active}
                total={totalActive}
                totalSuffix={t('/mo')}
                showProgress
              />
            )}

            <ExpandableSection label={t('Ending this month')} items={[...ending].sort((a, b) => b.monthly_amount - a.monthly_amount)} total={totalFreed} showInstallmentCount />
            <ExpandableSection label={t('Starting this month')} items={[...starting].sort((a, b) => b.monthly_amount - a.monthly_amount)} total={totalNewBurden} showInstallmentCount />

            {ending.length > 0 && (
              <div
                className="flex justify-between items-center border-t border-gray-100 dark:border-gray-700 pt-2"
                title={t('Does not include installments that will start next month')}
              >
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('Net change next month')}</span>
                <span className={`text-sm font-medium tabular-nums ${netBurdenChange < 0 ? 'text-emerald-600 dark:text-emerald-400' : netBurdenChange > 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                  {netBurdenChange > 0 ? '+' : ''}{money(netBurdenChange, { precision: 0 })}{t('/mo')}
                </span>
              </div>
            )}
          </div>

          {active.length > 0 && (
            <>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={timeline} margin={{ top: 14, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const val = payload[0]?.value as number | undefined;
                      if (val == null) return null;
                      return (
                        <ChartTooltip className="text-xs px-2 py-1">
                          {money(val, { precision: 0 })}
                        </ChartTooltip>
                      );
                    }}
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  />
                  <Bar dataKey="total" radius={[2, 2, 0, 0]}>
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={shortK}
                      style={{ fontSize: 9, fill: '#6B7280' }}
                    />
                    {timeline.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.total === 0 ? '#E5E7EB' : entry.total < maxTimeline * 0.5 ? '#93C5FD' : '#3B82F6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-left">{t('12-month obligations')}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

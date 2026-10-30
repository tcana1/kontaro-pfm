import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from 'date-fns';
import { format, subMonths, subYears, getDaysInMonth } from 'date-fns';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useFinance } from '@/contexts/finance-context';
import { useMoney } from '@/hooks/useMoney';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import { getTodayISO } from '@/lib/date-utils';

interface Props {
  selectedMonth: Date;
}

interface MonthlyTotals {
  current_net: number;
  prior_net: number;
  prior_year_net: number;
  projected_installments: number;
  // Only for the month in progress: the same number of elapsed days in each
  // month, so a half-finished month is not compared against two whole ones.
  // projected_mtd is the projection cut to that same window.
  projected_mtd: number | null;
  mtd_net: number | null;
  prior_mtd_net: number | null;
  prior_year_mtd_net: number | null;
  comparison_days: number | null;
  comparison_through: string | null;
}

function rangeLabel(monthStart: Date, days: number, dateLocale: Locale): string {
  return `1–${Math.min(days, getDaysInMonth(monthStart))} ${format(monthStart, 'MMM', { locale: dateLocale })}`;
}

function DeltaBadge({ value, label }: { value: number; label?: string }) {
  const { t } = useTranslation();
  const pct = Math.abs(value * 100);
  const formatted = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();

  if (Math.abs(value) < 0.01) {
    return (
      <span className="flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500">
        <Minus className="h-3.5 w-3.5" />
        {t('flat')}{label ? ` ${label}` : ''}
      </span>
    );
  }

  const isUp = value > 0;
  return (
    <span className={`flex items-center gap-1 text-sm ${isUp ? 'text-amber-500' : 'text-emerald-500'}`}>
      {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {isUp ? '+' : '-'}{formatted}%{label ? ` ${label}` : ''}
    </span>
  );
}

export default function HeadlineStrip({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const { showInstallmentProjection } = useFinance();
  const money = useMoney();
  const dateLocale = useDateFnsLocale();
  const monthKey = format(selectedMonth, 'yyyy-MM');
  const today = getTodayISO();

  const { data, isLoading } = useServiceQuery<MonthlyTotals>(
    ['get_dashboard_monthly_totals', monthKey, today],
    {
      rawQuery: true,
      queryParams: { p_month: format(selectedMonth, 'yyyy-MM-dd'), p_today: today },
    }
  );

  const projected  = showInstallmentProjection ? (data?.projected_installments ?? 0) : 0;
  const netSpend   = data?.current_net ?? 0;

  // The headline keeps showing the whole month; only the deltas switch to the
  // elapsed-days window while the month is still open.
  const proRataDays = data?.comparison_through ? (data.comparison_days ?? 0) : 0;

  // The open card bill reports no installment, so without the projection the
  // month in progress is compared short against two months that carry theirs.
  const projectedInWindow = proRataDays
    ? (showInstallmentProjection ? (data?.projected_mtd ?? 0) : 0)
    : projected;

  const current     = proRataDays ? (data?.mtd_net            ?? 0) : netSpend;
  const prior       = proRataDays ? (data?.prior_mtd_net      ?? 0) : (data?.prior_net      ?? 0);
  const priorYear   = proRataDays ? (data?.prior_year_mtd_net ?? 0) : (data?.prior_year_net ?? 0);
  const withProj    = current + projectedInWindow;
  const hasProj     = projectedInWindow > 0;

  const momDelta = prior > 0 ? (current - prior) / prior : null;
  const yoyDelta = priorYear > 0 ? (current - priorYear) / priorYear : null;
  const momProjDelta = hasProj && prior > 0 ? (withProj - prior) / prior : null;
  const yoyProjDelta = hasProj && priorYear > 0 ? (withProj - priorYear) / priorYear : null;

  const projTitle = t('With the projected installments added to the current window');

  const projectedLabel = (delta: number, base: number, compact: boolean) =>
    t('{{amount}} projected', {
      amount: `${delta > 0 ? '+' : ''}${money(withProj - base, { precision: 0, compact })}`,
    });

  const comparisonTitle = (previousMonth: Date) =>
    proRataDays
      ? t('Comparing {{current}} with {{previous}}', {
          current: rangeLabel(selectedMonth, proRataDays, dateLocale),
          previous: rangeLabel(previousMonth, proRataDays, dateLocale),
        })
      : undefined;

  const momTitle = comparisonTitle(subMonths(selectedMonth, 1));
  const yoyTitle = comparisonTitle(subYears(selectedMonth, 1));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {/* Net Spend */}
      <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('Net Spend')}</p>
        {isLoading ? (
          <div className="mt-2 h-9 w-36 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <>
            <p className="mt-2 text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {money(netSpend, { precision: 0 })}
            </p>
            {projected > 0 && (
              <p
                className="mt-1 text-sm text-gray-500 dark:text-gray-400 tabular-nums"
                title={t('Installments the open card bill should charge this month, not yet reported by the bank')}
              >
                {t('+{{amount}} projected', { amount: money(projected, { precision: 0 }) })}
              </p>
            )}
          </>
        )}
      </div>

      {/* Month over Month */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm text-center sm:text-left" title={momTitle}>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('vs Prior Month')}</p>
        {isLoading ? (
          <div className="mt-2 h-9 w-28 mx-auto sm:mx-0 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : momDelta === null ? (
          <p className="mt-2 text-lg text-gray-400 dark:text-gray-500">{t('No prior data')}</p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[max-content_max-content] justify-items-center sm:justify-items-start items-baseline gap-x-3 gap-y-1">
              <p className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {momDelta > 0 ? '+' : ''}{money(current - prior, { precision: 0 })}
              </p>
              <DeltaBadge value={momDelta} label={t('MoM')} />
              {momProjDelta !== null && (
                <>
                  <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums" title={projTitle}>
                    <span className="sm:hidden">{projectedLabel(momProjDelta, prior, true)}</span>
                    <span className="hidden sm:inline">{projectedLabel(momProjDelta, prior, false)}</span>
                  </p>
                  <DeltaBadge value={momProjDelta} />
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Year over Year */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm text-center sm:text-left" title={yoyTitle}>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('vs Prior Year')}</p>
        {isLoading ? (
          <div className="mt-2 h-9 w-28 mx-auto sm:mx-0 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : yoyDelta === null ? (
          <p className="mt-2 text-lg text-gray-400 dark:text-gray-500">{t('No prior data')}</p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[max-content_max-content] justify-items-center sm:justify-items-start items-baseline gap-x-3 gap-y-1">
              <p className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {yoyDelta > 0 ? '+' : ''}{money(current - priorYear, { precision: 0 })}
              </p>
              <DeltaBadge value={yoyDelta} label={t('YoY')} />
              {yoyProjDelta !== null && (
                <>
                  <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums" title={projTitle}>
                    <span className="sm:hidden">{projectedLabel(yoyProjDelta, priorYear, true)}</span>
                    <span className="hidden sm:inline">{projectedLabel(yoyProjDelta, priorYear, false)}</span>
                  </p>
                  <DeltaBadge value={yoyProjDelta} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

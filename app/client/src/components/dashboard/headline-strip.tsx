
import React from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';

interface Props {
  selectedMonth: Date;
}

interface MonthlyTotals {
  current_net: number;
  prior_net: number;
  prior_year_net: number;
  projected_installments: number;
}

function DeltaBadge({ value, label }: { value: number; label: string }) {
  const { t } = useTranslation();
  const pct = Math.abs(value * 100);
  const formatted = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString();

  if (Math.abs(value) < 0.01) {
    return (
      <span className="flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500">
        <Minus className="h-3.5 w-3.5" />
        {label}: {t('flat')}
      </span>
    );
  }

  const isUp = value > 0;
  return (
    <span className={`flex items-center gap-1 text-sm ${isUp ? 'text-amber-500' : 'text-emerald-500'}`}>
      {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {label}: {isUp ? '+' : '-'}{formatted}%
    </span>
  );
}

export default function HeadlineStrip({ selectedMonth }: Props) {
  const { t } = useTranslation();
  const { currency, showInstallmentProjection } = useFinance();
  const monthKey = format(selectedMonth, 'yyyy-MM');

  const { data, isLoading } = useServiceQuery<MonthlyTotals>(
    ['get_dashboard_monthly_totals', monthKey],
    {
      rawQuery: true,
      queryParams: { p_month: format(selectedMonth, 'yyyy-MM-dd') },
    }
  );

  const current    = data?.current_net    ?? 0;
  const prior      = data?.prior_net      ?? 0;
  const priorYear  = data?.prior_year_net ?? 0;
  const projected  = showInstallmentProjection ? (data?.projected_installments ?? 0) : 0;

  const momDelta = prior > 0 ? (current - prior) / prior : null;
  const yoyDelta = priorYear > 0 ? (current - priorYear) / priorYear : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {/* Net Spend */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('Net Spend')}</p>
        {isLoading ? (
          <div className="mt-2 h-9 w-36 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <>
            <p className="mt-2 text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatCurrency(current, currency, 0)}
            </p>
            {projected > 0 && (
              <p
                className="mt-1 text-sm text-gray-500 dark:text-gray-400 tabular-nums"
                title={t('Installments the open card bill should charge this month, not yet reported by the bank')}
              >
                {t('+{{amount}} projected', { amount: formatCurrency(projected, currency, 0) })}
              </p>
            )}
          </>
        )}
      </div>

      {/* Month over Month */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('vs Prior Month')}</p>
        {isLoading ? (
          <div className="mt-2 h-9 w-28 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : momDelta === null ? (
          <p className="mt-2 text-lg text-gray-400 dark:text-gray-500">{t('No prior data')}</p>
        ) : (
          <>
            <p className="mt-2 text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {momDelta > 0 ? '+' : ''}{formatCurrency(current - prior, currency, 0)}
            </p>
            <DeltaBadge value={momDelta} label={t('MoM')} />
          </>
        )}
      </div>

      {/* Year over Year */}
      <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('vs Prior Year')}</p>
        {isLoading ? (
          <div className="mt-2 h-9 w-28 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
        ) : yoyDelta === null ? (
          <p className="mt-2 text-lg text-gray-400 dark:text-gray-500">{t('No prior data')}</p>
        ) : (
          <>
            <p className="mt-2 text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {yoyDelta > 0 ? '+' : ''}{formatCurrency(current - priorYear, currency, 0)}
            </p>
            <DeltaBadge value={yoyDelta} label={t('YoY')} />
          </>
        )}
      </div>
    </div>
  );
}

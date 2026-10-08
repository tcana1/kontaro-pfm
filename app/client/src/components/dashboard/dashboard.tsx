
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import { format, subMonths, addMonths, startOfMonth, isBefore, setMonth, setYear, getYear, getMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import HeadlineStrip from './headline-strip';
import SurprisesCard from './surprises-card';
import InstallmentPanel from './installment-panel';
import LargestTransactionsCard from './largest-transactions-card';
import NewMerchantsCard from './new-merchants-card';
import CategorySparklines from './category-sparklines';
import InsightDrawer from './insight-drawer';
import EmptyState from './empty-state';
import { useInsightRun, insightRunsQueryKey } from '@/hooks/useInsightRun';
import { useMobileHeader } from '@/contexts/mobile-header-context';
import { useFinance } from '@/contexts/finance-context';

function MonthPicker({
  selected,
  onChange,
  maxDate,
}: {
  selected: Date;
  onChange: (d: Date) => void;
  maxDate: Date;
}) {
  const dateLocale = useDateFnsLocale();
  const [pickerYear, setPickerYear] = useState(getYear(selected));

  return (
    <div className="w-56">
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setPickerYear(y => y - 1)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{pickerYear}</span>
        <button
          onClick={() => setPickerYear(y => y + 1)}
          disabled={pickerYear >= getYear(maxDate)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, i) => {
          const candidate = startOfMonth(setMonth(setYear(new Date(), pickerYear), i));
          const label = format(candidate, 'MMM', { locale: dateLocale });
          const isSelected = getYear(selected) === pickerYear && getMonth(selected) === i;
          const isDisabled = !isBefore(candidate, startOfMonth(addMonths(maxDate, 1)));
          return (
            <button
              key={i}
              disabled={isDisabled}
              onClick={() => onChange(candidate)}
              className={`
                text-xs py-1.5 rounded transition-colors capitalize
                ${isSelected
                  ? 'bg-blue-500 text-white font-semibold'
                  : isDisabled
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
              `}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const { accounts, isLoading, error } = useFinance();
  const queryClient = useQueryClient();
  const today = startOfMonth(new Date());
  const [selectedMonth, setSelectedMonth] = useState<Date>(startOfMonth(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);

  const canGoForward = isBefore(selectedMonth, today);
  const { data: insightRun } = useInsightRun(selectedMonth);

  function handleMonthChange(d: Date) {
    setSelectedMonth(d);
    setPickerOpen(false);
  }

  // Refetch on open so reports saved externally (via MCP agent) show up without a hard refresh.
  function handleInsightOpenChange(open: boolean) {
    if (open) {
      queryClient.invalidateQueries({ queryKey: insightRunsQueryKey });
    }
    setInsightOpen(open);
  }

  // ── Mobile header: compact month navigator ────────────────────────────────
  useMobileHeader(() => (
    <div className="flex items-center gap-0.5 flex-1 min-w-0">
      <button
        onClick={() => setSelectedMonth(prev => startOfMonth(subMonths(prev, 1)))}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 px-1 tabular-nums capitalize">
        {format(selectedMonth, 'MMM yyyy', { locale: dateLocale })}
      </span>
      <button
        onClick={() => setSelectedMonth(prev => startOfMonth(addMonths(prev, 1)))}
        disabled={!canGoForward}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        onClick={() => setInsightOpen(true)}
        className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <FileText className="h-3 w-3" />
        {t('Analysis')}
      </button>
    </div>
  ), [selectedMonth, canGoForward]);

  if (!isLoading && !error && accounts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Month navigation — desktop only (mobile is in the header bar) */}
      <div className="hidden md:flex items-center gap-1">
        <button
          onClick={() => setSelectedMonth(prev => startOfMonth(subMonths(prev, 1)))}
          className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button className="px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {format(selectedMonth, 'MMMM yyyy', { locale: dateLocale })}
              </h1>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <MonthPicker
              selected={selectedMonth}
              onChange={handleMonthChange}
              maxDate={today}
            />
          </PopoverContent>
        </Popover>

        <button
          onClick={() => setSelectedMonth(prev => startOfMonth(addMonths(prev, 1)))}
          disabled={!canGoForward}
          className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <button
          onClick={() => setInsightOpen(true)}
          title={t('View analysis')}
          className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          {t('Analysis')}
        </button>
      </div>

      <HeadlineStrip selectedMonth={selectedMonth} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SurprisesCard selectedMonth={selectedMonth} />
        <InstallmentPanel selectedMonth={selectedMonth} />
      </div>

      <CategorySparklines selectedMonth={selectedMonth} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LargestTransactionsCard selectedMonth={selectedMonth} />
        <NewMerchantsCard selectedMonth={selectedMonth} />
      </div>

      <InsightDrawer
        open={insightOpen}
        onOpenChange={handleInsightOpenChange}
        run={insightRun ?? null}
        selectedMonth={selectedMonth}
      />
    </div>
  );
}

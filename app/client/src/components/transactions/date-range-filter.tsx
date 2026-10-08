import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { formatDateForDisplay, toISODateString, localDateString } from '@/lib/date-utils';
import type { ActiveFilters } from './transaction-filter';

interface DateRangeFilterProps {
  activeFilters: ActiveFilters;
  onApplyFilters: (filters: ActiveFilters) => void;
}

type SelectionState = 'none' | 'from' | 'to';
type DatePickerMode = 'month' | 'days';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const isCleanMonthRange = (range: { from: Date; to?: Date }) => {
  if (!range.to) return false;
  const end = endOfMonth(range.from);
  return (
    range.from.getDate() === 1 &&
    range.from.getMonth() === range.to.getMonth() &&
    range.from.getFullYear() === range.to.getFullYear() &&
    range.to.getDate() === end.getDate()
  );
};

const formatMonthLabel = (d: Date) =>
  `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ activeFilters, onApplyFilters }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<DatePickerMode>('month');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectionState, setSelectionState] = useState<SelectionState>('none');
  const [draftRange, setDraftRange] = useState<{ from: Date; to?: Date } | undefined>();

  useEffect(() => {
    if (isOpen) {
      if (activeFilters.dateRange) {
        setDraftRange(activeFilters.dateRange);
        setMode(isCleanMonthRange(activeFilters.dateRange) ? 'month' : 'days');
        setSelectionState('to');
      } else {
        setDraftRange(undefined);
        setMode('month');
        setSelectionState('none');
      }
    }
  }, [isOpen, activeFilters]);

  // 18 months: 17 months ago → current month
  const monthOptions = React.useMemo(() => {
    const today = new Date();
    const months: Date[] = [];
    for (let i = 17; i >= 0; i--) {
      months.push(new Date(today.getFullYear(), today.getMonth() - i, 1));
    }
    return months;
  }, []);

  const handleMonthSelect = (month: Date) => {
    onApplyFilters({ ...activeFilters, dateRange: { from: startOfMonth(month), to: endOfMonth(month) } });
    setIsOpen(false);
  };

  const handleDateClick = (date: Date) => {
    switch (selectionState) {
      case 'none':
      case 'to':
        setDraftRange({ from: date });
        setSelectionState('from');
        break;
      case 'from':
        const clickedDateStr = localDateString(date);
        const fromDateStr = localDateString(draftRange!.from);
        if (clickedDateStr >= fromDateStr) {
          setDraftRange(prev => ({ ...prev!, to: date }));
          setSelectionState('to');
        } else {
          setDraftRange({ from: date });
          setSelectionState('from');
        }
        break;
    }
  };

  const handleApply = () => {
    if (draftRange?.from) {
      onApplyFilters({ ...activeFilters, dateRange: draftRange });
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    const { dateRange, ...filtersWithoutDate } = activeFilters;
    onApplyFilters(filtersWithoutDate);
    setIsOpen(false);
  };

  const isDateRangeActive = !!activeFilters.dateRange?.from;
  const activeIsCleanMonth = isDateRangeActive && isCleanMonthRange(activeFilters.dateRange!);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <ActionTooltip label={t('Date range')}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={isDateRangeActive ? 'border-blue-500 gap-1 h-8 pr-2' : 'h-8 gap-0'}>
          <CalendarIcon className="h-4 w-4" />
          {isDateRangeActive && activeIsCleanMonth && (
            <span className="text-xs font-medium text-blue-500">
              {formatMonthLabel(activeFilters.dateRange!.from)}
            </span>
          )}
          {isDateRangeActive && !activeIsCleanMonth && (
            <span className="ml-1 h-5 w-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs">
              1
            </span>
          )}
        </Button>
      </PopoverTrigger>
      </ActionTooltip>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3">
          {/* Header + toggle */}
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">{t("Date Range")}</h4>
            <div className="flex rounded-md border text-xs overflow-hidden">
              <button
                className={`px-2.5 py-1 transition-colors ${mode === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setMode('month')}
              >
                {t("Month")}
              </button>
              <button
                className={`px-2.5 py-1 transition-colors ${mode === 'days' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setMode('days')}
              >
                {t("Days")}
              </button>
            </div>
          </div>

          {mode === 'month' ? (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {monthOptions.map((month) => {
                  const isSelected = activeIsCleanMonth &&
                    activeFilters.dateRange!.from.getMonth() === month.getMonth() &&
                    activeFilters.dateRange!.from.getFullYear() === month.getFullYear();
                  return (
                    <button
                      key={month.toISOString()}
                      onClick={() => handleMonthSelect(month)}
                      className={`text-xs py-1.5 px-2 rounded-md border transition-colors ${
                        isSelected
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'hover:bg-muted border-transparent hover:border-input'
                      }`}
                    >
                      {formatMonthLabel(month)}
                    </button>
                  );
                })}
              </div>
              {isDateRangeActive && (
                <div className="mt-3 pt-3 border-t">
                  <Button variant="ghost" size="sm" onClick={handleClear}>{t("Clear")}</Button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Mobile: native date inputs */}
              <div className="md:hidden space-y-2 mb-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("From")}</label>
                  <input
                    type="date"
                    value={draftRange?.from ? toISODateString(draftRange.from) : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        setDraftRange(prev => ({ ...prev, from: new Date(Date.UTC(y, m - 1, d, 12)) }));
                      }
                    }}
                    className="w-full h-8 px-2 text-sm border border-input rounded-md bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("To")}</label>
                  <input
                    type="date"
                    value={draftRange?.to ? toISODateString(draftRange.to) : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        setDraftRange(prev => ({ ...prev!, to: new Date(Date.UTC(y, m - 1, d, 12)) }));
                      }
                    }}
                    className="w-full h-8 px-2 text-sm border border-input rounded-md bg-background"
                  />
                </div>
              </div>

              {/* Desktop: calendar picker */}
              <div className="hidden md:block">
                <div className="text-xs text-muted-foreground mb-2">
                  {selectionState === 'from' && draftRange?.from && (
                    `${t("From:")} ${formatDateForDisplay(draftRange.from, 'en-US', 'MM/DD/YYYY')} • ${t("Click to select end date")}`
                  )}
                  {selectionState === 'to' && draftRange?.from && (
                    `${formatDateForDisplay(draftRange.from, 'en-US', 'MM/DD/YYYY')} - ${
                      draftRange.to
                        ? formatDateForDisplay(draftRange.to, 'en-US', 'MM/DD/YYYY')
                        : t("Click to select end date")
                    }`
                  )}
                  {selectionState === 'none' && t("Click to select start date")}
                </div>
                <Calendar
                  mode="single"
                  selected={undefined}
                  onSelect={(date) => { if (date) handleDateClick(date); }}
                  month={currentMonth}
                  onMonthChange={setCurrentMonth}
                  className="rounded-md border-0"
                  modifiers={{
                    selected_range: (date) => {
                      if (!draftRange?.from) return false;
                      if (!draftRange?.to) return date.toDateString() === draftRange.from.toDateString();
                      return date >= draftRange.from && date <= draftRange.to;
                    }
                  }}
                  modifiersStyles={{
                    selected_range: { backgroundColor: 'rgb(59, 130, 246)', color: 'white', borderRadius: '6px' }
                  }}
                />
              </div>

              <div className="flex justify-between mt-3 pt-3 border-t">
                <Button variant="ghost" onClick={handleClear}>{t("Clear")}</Button>
                <Button onClick={handleApply} disabled={!draftRange?.from}>{t("Apply")}</Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangeFilter;

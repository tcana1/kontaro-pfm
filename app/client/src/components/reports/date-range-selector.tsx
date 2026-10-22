import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { editDateRange, formatDateForDisplay, localDateFromString, localDateString } from '@/lib/date-utils';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import { useFinance } from '@/contexts/finance-context';

interface DateRangeSelectorProps {
  startDate: Date;
  endDate: Date;
  onChange: (startDate: Date, endDate: Date) => void;
}

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  startDate,
  endDate,
  onChange
}) => {
  const { t } = useTranslation();
  const { locale, dateFormat } = useFinance();
  const dateLocale = useDateFnsLocale();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const getDisplayText = () => {
    const isAllTimeRange = startDate.getTime() === new Date(1900, 0, 1).getTime();

    return isAllTimeRange
      ? t('All Time')
      : `${formatDateForDisplay(startDate, locale, dateFormat)} - ${formatDateForDisplay(endDate, locale, dateFormat)}`;
  };

  const handleEdit = (edited: 'start' | 'end', date: Date) => {
    const [start, end] = editDateRange(startDate, endDate, edited, date);
    onChange(start, end);
  };

  const handleNativeInput = (edited: 'start' | 'end') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = localDateFromString(e.target.value);
    if (date) handleEdit(edited, date);
  };

  return (
    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 min-w-[220px] shrink-0 justify-start">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] max-w-sm p-0 md:w-auto md:max-w-none" align="start">
        <div className="md:hidden space-y-3 p-3">
          <div>
            <label className="text-sm font-medium block mb-1">{t('Start Date')}</label>
            <input
              type="date"
              value={localDateString(startDate)}
              onChange={handleNativeInput('start')}
              className="w-full h-9 px-2 text-sm border border-input rounded-md bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">{t('End Date')}</label>
            <input
              type="date"
              value={localDateString(endDate)}
              onChange={handleNativeInput('end')}
              className="w-full h-9 px-2 text-sm border border-input rounded-md bg-background"
            />
          </div>
        </div>
        <div className="hidden md:flex">
          <div className="p-3 border-r">
            <div className="text-sm font-medium mb-2">{t('Start Date')}</div>
            <Calendar
              mode="single"
              locale={dateLocale}
              selected={startDate}
              onSelect={(date) => date && handleEdit('start', date)}
              initialFocus
            />
          </div>
          <div className="p-3">
            <div className="text-sm font-medium mb-2">{t('End Date')}</div>
            <Calendar
              mode="single"
              locale={dateLocale}
              selected={endDate}
              onSelect={(date) => date && handleEdit('end', date)}
            />
          </div>
        </div>
        <div className="p-3 border-t flex justify-end">
          <Button
            size="sm"
            onClick={() => setCalendarOpen(false)}
          >
            {t('Done')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangeSelector;

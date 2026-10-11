import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { formatDateForDisplay } from '@/lib/date-utils';
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
  const [calendarOpen, setCalendarOpen] = useState(false);

  const getDisplayText = () => {
    const isAllTimeRange = startDate.getTime() === new Date(1900, 0, 1).getTime();

    return isAllTimeRange
      ? t('All Time')
      : `${formatDateForDisplay(startDate, locale, dateFormat)} - ${formatDateForDisplay(endDate, locale, dateFormat)}`;
  };

  return (
    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 min-w-[220px] shrink-0 justify-start">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <div className="p-3 border-r">
            <div className="text-sm font-medium mb-2">{t('Start Date')}</div>
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(date) => date && onChange(date, endDate)}
              initialFocus
            />
          </div>
          <div className="p-3">
            <div className="text-sm font-medium mb-2">{t('End Date')}</div>
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(date) => date && onChange(startDate, date)}
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
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toISODateString, formatDateForDisplay } from '@/lib/date-utils';
import { useFinance } from '@/contexts/finance-context';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
}

const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  onBlur,
  error,
}) => {
  const { t } = useTranslation();
  const { locale, dateFormat } = useFinance();

  return (
    <div className="space-y-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "text-left font-normal flex h-7 p-2",
              !value && "text-muted-foreground",
              error ? "border-red-500" : ""
            )}
            onBlur={onBlur}
          >
            {value ? (
              (() => {
                try {
                  return formatDateForDisplay(value, locale, dateFormat === 'default' ? 'MM/DD/YYYY' : dateFormat);
                } catch (e) {
                  console.error("Invalid date value:", value);
                  return t("Invalid date");
                }
              })()
            ) : (
              <span>{t("Pick a date")}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={(() => {
              try {
                if (!value) return undefined;

                const [year, month, day] = value.split('-').map(Number);
                return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
              } catch (e) {
                console.error("Invalid date for calendar:", value);
                return undefined;
              }
            })()}
            onSelect={(date) => {
              if (date) {
                const isoDate = toISODateString(date);
                onChange(isoDate);
                // Close popover after selection
                const button = document.querySelector('[aria-expanded="true"]');
                if (button) (button as HTMLElement).click();
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};

export default DateInput;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface DatePresetButtonsProps {
  onPresetSelect: (startDate: Date, endDate: Date) => void;
  selectedStartDate?: Date;
  selectedEndDate?: Date;
}

type DateRangePreset = {
  label: string;
  value: string;
  startDate: Date;
  endDate: Date;
  isAllTime?: boolean;
};

const DatePresetButtons: React.FC<DatePresetButtonsProps> = ({
  onPresetSelect,
  selectedStartDate,
  selectedEndDate
}) => {
  const { t } = useTranslation();

  const getDateRangePresets = (): DateRangePreset[] => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return [
      {
        label: t('Last Month'),
        value: 'last_month',
        startDate: new Date(currentYear, currentMonth - 1, 1),
        endDate: new Date(currentYear, currentMonth, 0)
      },
      {
        label: t('Last 6M'),
        value: 'last_6_months',
        startDate: new Date(currentYear, currentMonth - 6, 1),
        endDate: new Date(currentYear, currentMonth, 0)
      },
      {
        label: t('Last 12M'),
        value: 'last_12_months',
        startDate: new Date(currentYear, currentMonth - 12, 1),
        endDate: new Date(currentYear, currentMonth, 0)
      },
      {
        label: t('This Year'),
        value: 'this_year',
        startDate: new Date(currentYear, 0, 1),
        endDate: new Date(currentYear, currentMonth, now.getDate())
      },
      {
        label: t('Last Year'),
        value: 'last_year',
        startDate: new Date(currentYear - 1, 0, 1),
        endDate: new Date(currentYear - 1, 11, 31)
      },
      {
        label: t('All Time'),
        value: 'all_time',
        startDate: new Date(1900, 0, 1),
        endDate: new Date(currentYear, currentMonth, now.getDate()),
        isAllTime: true
      }
    ];
  };

  const presets = getDateRangePresets();

  const isPresetActive = (preset: DateRangePreset): boolean => {
    if (!selectedStartDate || !selectedEndDate) return false;
    return preset.startDate.getTime() === selectedStartDate.getTime() &&
           preset.endDate.getTime() === selectedEndDate.getTime();
  };

  const handlePresetClick = (preset: DateRangePreset) => {
    onPresetSelect(preset.startDate, preset.endDate);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={isPresetActive(preset) ? "default" : "outline"}
          size="sm"
          onClick={() => handlePresetClick(preset)}
          className="h-8 text-xs"
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
};

export default DatePresetButtons;

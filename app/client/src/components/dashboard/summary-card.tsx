import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useMoney } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  title: string;
  value: number;
  percentChange: number;
  icon: React.ReactNode;
  isMonetary?: boolean;
  iconBackground?: string;
  description?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  percentChange,
  icon,
  isMonetary = true,
  iconBackground = 'bg-blue-100 dark:bg-blue-900/30',
  description
}) => {
  const { t } = useTranslation();
  const money = useMoney();
  const descriptionText = description ?? t('from last month');
  
  const isPositiveChange = percentChange >= 0;
  const changeColor = isPositiveChange ? 'text-success' : 'text-danger';
  
  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <h3 className="text-2xl font-semibold mt-1">
              {isMonetary ? money(value) : `${value.toFixed(1)}%`}
            </h3>
          </div>
          <div className={cn("p-2 rounded-md", iconBackground)}>
            {icon}
          </div>
        </div>
        <div className="mt-3 flex items-center">
          <span className={cn("text-xs flex items-center", changeColor)}>
            {isPositiveChange ? (
              <TrendingUp className="mr-1 h-3 w-3" />
            ) : (
              <TrendingDown className="mr-1 h-3 w-3" />
            )}
            {Math.abs(percentChange).toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            {descriptionText}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default SummaryCard;

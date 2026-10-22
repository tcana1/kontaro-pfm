import React from 'react';
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency-formatter';
import { useFinance } from '@/contexts/finance-context';
import { cn } from '@/lib/utils';

interface SplitRowProps {
  split: {
    category_name: string;
    category_group_name: string;
    category_group_emoji: string;
    split_observation: string;
    amount: any;
    category_is_income?: boolean;
  };
  onDoubleClick?: () => void;
}

const SplitRow: React.FC<SplitRowProps> = ({ split, onDoubleClick }) => {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const { currency } = useFinance();

  const isIncome = split.category_is_income;
  const categoryName = split.category_name || t('Uncategorized');
  const emoji = split.category_group_emoji;
  const groupName = split.category_group_name;

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 border-l-2 border-l-violet-300 dark:border-l-violet-600 bg-muted/20" {...(onDoubleClick ? bindDoubleTap(onDoubleClick) : {})}>
      {/* Checkbox col — empty */}
      <td className="px-4 text-sm h-[25px]" />

      {/* Tags col — empty */}
      <td className="px-1 text-sm h-[25px]" />

      {/* Date col — tree connector */}
      <td className="px-4 text-sm h-[25px]">
        <span className="text-muted-foreground/50 select-none text-base leading-none">╰</span>
      </td>

      {/* Payee col — empty */}
      <td className="px-4 text-sm h-[25px]" />

      {/* Category col — indented */}
      <td className="px-4 text-sm h-[25px]">
        <div className="flex items-center pl-4 gap-1 text-muted-foreground">
          {emoji && <span className="text-base leading-none">{emoji}</span>}
          <span className="truncate">
            {groupName ? `${groupName}: ` : ''}{categoryName}
          </span>
        </div>
      </td>

      {/* Notes col */}
      <td className="hidden md:table-cell px-4 text-sm h-[25px] max-w-[150px]">
        <div className="truncate pl-4 text-muted-foreground" title={split.split_observation}>
          {split.split_observation || ''}
        </div>
      </td>

      {/* Account col — empty */}
      <td className="hidden md:table-cell px-4 text-sm h-[25px]" />

      {/* Amount col */}
      <td className={cn(
        "px-4 text-sm text-right",
        isIncome ? "text-green-600 dark:text-green-400" : "text-foreground"
      )}>
        {parseFloat(split.amount) < 0 ? "-" : ""}
        {formatCurrency(Math.abs(parseFloat(split.amount)), currency)}
      </td>

      {/* Installment col — empty */}
      <td className="hidden md:table-cell px-4 text-sm h-[25px]" />

      {/* Status col — empty */}
      <td className="px-4 text-sm h-[25px]" />

      {/* Ignore col — empty */}
      <td className="hidden md:table-cell px-2 text-sm h-[25px]" />

      {/* Buffer col */}
      <td className="w-[20px]" />
    </tr>
  );
};

export default SplitRow;

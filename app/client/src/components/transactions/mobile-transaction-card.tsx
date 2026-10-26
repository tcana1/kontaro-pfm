import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Edit, Trash2, Tag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CheckCircleEmpty from '@/assets/icons/check-circle-empty.svg?react';
import CheckCircleFilled from '@/assets/icons/check-circle-filled.svg?react';
import LockFilled from '@/assets/icons/lock-filled.svg?react';
import { useMoney } from '@/hooks/useMoney';
import { useFinance } from '@/contexts/finance-context';
import { useLongPress } from '@/hooks/use-long-press';
import { toISODateString, getTodayISO, formatDateForDisplay } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface MobileTx {
  id: number;
  payment_date: string | Date;
  payee: string;
  amount: string;
  totalAmount: string;
  type: string;
  status_id: number;
  status_name: string;
  is_reconciled?: boolean;
  is_ignored?: boolean;
  category_name: string;
  category_group_name: string;
  category_is_income?: boolean;
  to_account_name?: string;
  splitCount: number;
  notes?: string;
  account_name?: string;
  installment_number?: number;
  installment_total?: number;
  is_installment?: boolean;
  tag_id?: number | null;
  tag_name?: string | null;
  tag_color?: string | null;
  splits?: Array<{ split_observation?: string; category_name?: string; category_group_name?: string; split_amount?: number; amount?: string }>;
}

interface Props {
  transaction: MobileTx;
  handleStatusChange: (id: number, oldStatusId: number, newStatusId: number) => void;
  handleIgnoreToggle: (id: number, isIgnored: boolean) => void;
  onEditTransaction: () => void;
  onDeleteTransaction: () => void;
  onTagClick?: (tagId: number, tagName: string, tagColor: string) => void;
  onTagEdit?: () => void;
  showActions: boolean;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onLongPress?: () => void;
  onSelect?: () => void;
}

const MobileTransactionCard: React.FC<Props> = ({
  transaction,
  handleStatusChange,
  handleIgnoreToggle,
  onEditTransaction,
  onDeleteTransaction,
  onTagClick,
  onTagEdit,
  showActions,
  isSelectionMode = false,
  isSelected = false,
  onLongPress,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { locale, dateFormat } = useFinance();
  const money = useMoney();

  const longPressHandlers = useLongPress(() => onLongPress?.());

  const isIgnored = transaction.is_ignored || false;
  const isPending = transaction.status_name === 'Pending';
  const isOptimistic = transaction.id < 0;
  const isFuture = toISODateString(transaction.payment_date) > getTodayISO();
  const isTransfer = transaction.type === 'transfer';
  const isPayment = transaction.type === 'payment';
  const isSpecialTransaction = isTransfer || isPayment;
  const isSplit = transaction.splitCount >= 2;
  const displayAmount = transaction.totalAmount ?? transaction.amount;
  const isPositive = parseFloat(displayAmount) > 0;
  const isUncategorized = transaction.category_name === 'Uncategorized';

  // Notes: mirror the split-aware logic from TransactionRowDisplay
  const displayNotes = (() => {
    if (!isSplit || !transaction.splits || transaction.splits.length === 0) return transaction.notes || '';
    const withNotes = transaction.splits.filter(s => s.split_observation?.trim());
    if (withNotes.length === 0) return transaction.notes || '';
    if (withNotes.length === 1) return withNotes[0].split_observation!;
    return '…';
  })();

  const installmentStr = transaction.is_installment && transaction.installment_number && transaction.installment_total
    ? `${String(transaction.installment_number).padStart(2, '0')}/${String(transaction.installment_total).padStart(2, '0')}`
    : '';

  const borderColor = isSplit
    ? 'border-l-violet-400 dark:border-l-violet-500'
    : isPending
    ? 'border-l-yellow-400 dark:border-l-yellow-500'
    : isIgnored
    ? 'border-l-gray-300 dark:border-l-gray-600'
    : 'border-l-transparent';

  const dateStr = formatDateForDisplay(transaction.payment_date, locale, dateFormat);

  const linkedName = transaction.to_account_name || (isTransfer ? t('Unknown account') : t('External account'));

  const payeeText = isTransfer
    ? (parseFloat(transaction.amount) < 0 ? t('Transfer → {{name}}', { name: linkedName }) : t('{{name}} → Transfer', { name: linkedName }))
    : isPayment
    ? (parseFloat(transaction.amount) < 0 ? t('Payment → {{name}}', { name: linkedName }) : t('{{name}} → Payment', { name: linkedName }))
    : (transaction.payee || '');

  const categoryText = isTransfer
    ? t('Transfer')
    : isPayment
    ? t('Payment')
    : isSplit
    ? t('Split · {{count}}', { count: transaction.splitCount })
    : transaction.category_group_name
    ? `${transaction.category_group_name}: ${transaction.category_name}`
    : transaction.category_name;

  return (
    <div
      className={cn(
        'border-l-4 border-b border-gray-200 dark:border-gray-700 px-3 py-2.5 select-none',
        borderColor,
        isIgnored && 'opacity-50 italic',
        isPending ? 'font-semibold' : 'opacity-60',
        isFuture && 'italic text-gray-400 dark:text-gray-500',
        isOptimistic && 'opacity-60 bg-blue-50 dark:bg-blue-900/10',
        expanded && !isSelectionMode && 'bg-gray-50 dark:bg-gray-800/50',
        isSelected && 'bg-blue-50 dark:bg-blue-900/20',
      )}
      onClick={() => {
        if (isSelectionMode) {
          onSelect?.();
        } else {
          setExpanded(e => !e);
        }
      }}
      {...longPressHandlers}
    >
      {/* Row 1: date (left) | amount (right) [+ installment when expanded] */}
      <div className="flex justify-between items-baseline">
        <div className="flex items-center gap-2">
          {isSelectionMode && (
            <div className={cn(
              'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
              isSelected
                ? 'bg-blue-500 border-blue-500'
                : 'border-gray-300 dark:border-gray-600',
            )}>
              {isSelected && <Check className="h-3 w-3 text-white" />}
            </div>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">{dateStr}</span>
        </div>
        <div className="flex items-baseline gap-2">
          {expanded && installmentStr && (
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{installmentStr}</span>
          )}
          <span className={cn(
            'text-sm tabular-nums',
            isSpecialTransaction
              ? 'text-muted-foreground'
              : isPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-foreground',
          )}>
            {parseFloat(displayAmount) < 0 ? '-' : ''}
            {money(Math.abs(parseFloat(displayAmount)))}
          </span>
        </div>
      </div>

      {/* Row 2: payee (left, truncated) | category (right) */}
      <div className="flex justify-between items-baseline mt-0.5 gap-3">
        <span className={cn(
          'text-sm truncate flex-1 min-w-0',
          isSpecialTransaction && 'text-muted-foreground italic',
        )}>
          {payeeText}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {transaction.tag_color && (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: transaction.tag_color }} />
          )}
          <span className={cn(
              'text-xs text-gray-500 dark:text-gray-400',
              isUncategorized && !isIgnored && 'text-yellow-600 dark:text-yellow-400',
              isSplit && 'text-violet-600 dark:text-violet-400',
              isSpecialTransaction && 'text-muted-foreground italic',
            )}>
            {categoryText}
          </span>
        </span>
      </div>

      {/* Expanded: details + actions */}
      {expanded && (
        <div onClick={e => e.stopPropagation()}>
          {/* Row 3: account (left) | notes (right, if any) */}
          <div className="flex justify-between items-baseline mt-1 gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1 min-w-0">
              {transaction.account_name}
            </span>
            {displayNotes && (
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-shrink-0 max-w-[50%]">
                {displayNotes}
              </span>
            )}
          </div>

          {/* Row 4: tag chip (if any) — tappable to open tag detail */}
          {transaction.tag_name && transaction.tag_id && (
            <button
              className="flex items-center gap-1.5 mt-1 hover:opacity-70"
              onClick={() => onTagClick?.(transaction.tag_id!, transaction.tag_name!, transaction.tag_color ?? '#6B7280')}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: transaction.tag_color ?? undefined }} />
              <span className="text-xs text-gray-400 dark:text-gray-500 underline-offset-2 hover:underline">{transaction.tag_name}</span>
            </button>
          )}

          {/* Split breakdown (read-only) */}
          {isSplit && transaction.splits && transaction.splits.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {transaction.splits.map((s, i) => {
                const cat = s.category_group_name ? `${s.category_group_name}: ${s.category_name}` : s.category_name;
                const amt = s.split_amount ?? (s.amount ? parseFloat(s.amount) : null);
                return (
                  <div key={i} className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span className="truncate flex-1 min-w-0">{cat}</span>
                    {amt != null && (
                      <span className="tabular-nums flex-shrink-0 ml-2">
                        {amt < 0 ? '-' : ''}{money(Math.abs(amt))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          {showActions && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  // Cycle: Pending (1) → Cleared (2) → Pending (1)
                  const cycle: Record<number, number> = { 1: 2, 2: 1 };
                  const newStatus = cycle[transaction.status_id] ?? 1;
                  handleStatusChange(transaction.id, transaction.status_id, newStatus);
                }}
                disabled={!!transaction.is_reconciled || isOptimistic}
              >
                {transaction.is_reconciled ? (
                  <LockFilled className="h-4 w-4 text-green-600" />
                ) : isPending ? (
                  <CheckCircleEmpty className="h-4 w-4 text-gray-500" />
                ) : (
                  <CheckCircleFilled className="h-4 w-4 text-green-500" />
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleIgnoreToggle(transaction.id, isIgnored)}
                disabled={isOptimistic}
              >
                {isIgnored ? (
                  <EyeOff className="h-4 w-4 text-gray-500" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-600" />
                )}
              </Button>

              {isSplit ? (
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 italic">
                  {t('Edit splits on desktop')}
                </span>
              ) : (
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onTagEdit}
                    disabled={isOptimistic}
                    title={transaction.tag_name ?? 'Tag'}
                  >
                    {transaction.tag_color
                      ? <span className="w-3 h-3 rounded-full" style={{ backgroundColor: transaction.tag_color }} />
                      : <Tag className="h-4 w-4 text-gray-500" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={onEditTransaction}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-600 border-red-200"
                    onClick={onDeleteTransaction}
                    disabled={isOptimistic}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileTransactionCard;

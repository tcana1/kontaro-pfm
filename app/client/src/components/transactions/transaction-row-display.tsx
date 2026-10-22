import React from 'react';
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/currency-formatter';
import { formatDateForDisplay, toISODateString, getTodayISO } from '@/lib/date-utils';
import { useFinance } from '@/contexts/finance-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Edit, Trash2, Clock, Tag, ChevronDown, ChevronRight, AlertCircle, Loader2, Eye, EyeOff, X, Plus, Check, ArrowUpRight } from 'lucide-react';
import CheckCircleEmpty from '@/assets/icons/check-circle-empty.svg?react';
import CheckCircleFilled from '@/assets/icons/check-circle-filled.svg?react';
import LockFilled from '@/assets/icons/lock-filled.svg?react';
import { cn } from '@/lib/utils';
import type { Transaction, Tag as TagType } from '@shared/schema';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import TagDetail from '@/components/tags/tag-detail';

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#6B7280', '#0EA5E9', '#F97316', '#14B8A6',
];

// ── Tag picker cell ───────────────────────────────────────────────────────────

const TagPickerCell: React.FC<{ transaction: Transaction; onOpenDetail: (tagId: number, tagName: string, tagColor: string) => void }> = ({ transaction, onOpenDetail }) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState('#3B82F6');
  const queryClient = useQueryClient();
  const { data: tags = [] } = useServiceQuery<TagType[]>('tags');

  const handleSetTag = async (tagId: number | null) => {
    await supabaseService.setTransactionTag(transaction.id, tagId);
    CacheUtils.invalidateTransactionRelated(queryClient);
    CacheUtils.invalidateTagRelated(queryClient);
    setOpen(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const tag = await supabaseService.createTag(newName.trim(), newColor);
      return tag;
    },
    onSuccess: async (tag) => {
      CacheUtils.invalidateTagRelated(queryClient);
      if (tag?.id) {
        await supabaseService.setTransactionTag(transaction.id, tag.id);
        CacheUtils.invalidateTransactionRelated(queryClient);
      }
      setCreating(false);
      setNewName('');
      setNewColor('#3B82F6');
      setOpen(false);
    },
  });

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { setCreating(false); setNewName(''); setNewColor('#3B82F6'); }
  };

  const currentTag = tags.find(tag => tag.id === transaction.tag_id);

  return (
    <div className="flex items-center gap-1 min-w-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className="flex items-center justify-center w-5 h-5 flex-shrink-0 rounded hover:bg-gray-100 dark:hover:bg-gray-700 group"
          title={currentTag ? undefined : t('Add tag')}
        >
          <Tag
            className="h-3.5 w-3.5 transition-colors"
            style={transaction.tag_id && currentTag
              ? { color: currentTag.color, fill: currentTag.color }
              : undefined}
            strokeWidth={1.5}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        {tags.map(tag => {
          const isActive = transaction.tag_id === tag.id;
          return (
            <div
              key={tag.id}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700",
                isActive && "font-semibold"
              )}
              onClick={() => {
                if (isActive) {
                  setOpen(false);
                  onOpenDetail(tag.id, tag.name, tag.color ?? '#6B7280');
                } else {
                  handleSetTag(tag.id);
                }
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="truncate flex-1 min-w-0">{tag.name}</span>
              {isActive && (
                <>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <button
                    className="flex-shrink-0 text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
                    onClick={e => { e.stopPropagation(); handleSetTag(null); }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

        {!creating ? (
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-muted-foreground"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3 w-3" /> {t('New tag')}
          </button>
        ) : (
          <div className="px-2 py-1.5 space-y-2">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newName.trim()) createMutation.mutate();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              placeholder={t('Tag name')}
              className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={cn("w-4 h-4 rounded-full transition-transform", newColor === c && "ring-2 ring-offset-1 ring-gray-400 scale-110")}
                  style={{ backgroundColor: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div className="flex gap-1 pt-0.5">
              <button
                className="flex-1 text-xs py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-muted-foreground"
                onClick={() => { setCreating(false); setNewName(''); }}
              >
                {t('Cancel')}
              </button>
              <button
                disabled={!newName.trim() || createMutation.isPending}
                className="flex items-center justify-center gap-1 flex-1 text-xs py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> {t('Create')}</>}
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>

    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

interface TransactionRowDisplayProps {
  transaction: Transaction & {
    account_name: string;
    category_name: string;
    category_group_name: string;
    category_group_emoji: string;
    is_income: boolean;
    split_amount: number;
    split_observation: string;
    to_account_name: string;
    status_name: string;
    notes: string;
    installment_number: number;
    installment_total: number;
    is_installment: boolean;
    is_reconciled?: boolean;
  };
  splits?: Array<{ split_observation?: string }>;
  totalAmount?: string;
  splitCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: (transactionId: number) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transaction: Transaction) => void;
  handleSelectTransaction: (transaction: Transaction, checked: boolean, event?: React.MouseEvent) => void;
  isSelected: boolean;
  handleStatusChange: (transactionId: number, oldStatusId: number, newStatusId: number) => void;
  handleIgnoreToggle: (transactionId: number, currentIgnoreState: boolean) => void;
  showActions: boolean;
  hasBatchEditFailed?: boolean;
  failedTransactionError?: string;
  onReconciledEdit?: (transaction: Transaction) => void;
  matchCandidateId?: number | null;
  onMergeClick?: () => void;
}

const TransactionRowDisplay: React.FC<TransactionRowDisplayProps> = ({
  transaction,
  splits,
  totalAmount,
  splitCount = 1,
  isExpanded = false,
  onToggleExpand,
  onEditTransaction,
  onDeleteTransaction,
  handleSelectTransaction,
  isSelected,
  handleStatusChange,
  handleIgnoreToggle,
  showActions,
  hasBatchEditFailed = false,
  failedTransactionError,
  matchCandidateId,
  onMergeClick,
  onReconciledEdit,
}) => {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const { currency, locale, dateFormat } = useFinance();
  const [showStartingBalanceWarning, setShowStartingBalanceWarning] = React.useState(false);

  const isIncome = transaction.category_is_income;
  
  const handleEditClick = () => {
    // Check if this is a reconciliation adjustment transaction
    if ((transaction as any).category_id === -2) {
      // This is a reconciliation adjustment - show special warning
      alert('This is a reconciliation adjustment transaction and cannot be edited directly. To modify it, undo the reconciliation that created it.');
      return;
    }
    
    // Check if this is a starting balance transaction
    if ((transaction as any).category_id === -3) {
      // This is a starting balance transaction - show warning dialog
      setShowStartingBalanceWarning(true);
      return;
    }
    
    // Always use normal edit flow - our new inline editing handles reconciliation restrictions
    onEditTransaction(transaction);
  };

  const formattedDate = formatDateForDisplay(
    transaction.payment_date,
    locale,
    dateFormat,
  );

  const categoryName = transaction.category_name;
  const accountName = transaction.account_name;
  const emoji = transaction.category_group_emoji;

  const [detailTag, setDetailTag] = React.useState<{ id: number; name: string; color: string } | null>(null);

  const isTransfer = transaction.type === "transfer";
  const isPayment = transaction.type === "payment";
  const isSpecialTransaction = isTransfer || isPayment;

  // Debug logging for transaction display (commented out to avoid render loops)
  // if (transaction.to_account_id || isTransfer || isPayment) {
  //   console.log(`🎨 DISPLAY DEBUG: Transaction ${transaction.id} display data:`, {
  //     type: transaction.type,
  //     isTransfer,
  //     isPayment,
  //     isSpecialTransaction,
  //     to_account_id: transaction.to_account_id,
  //     to_account_name: transaction.to_account_name,
  //     payee: transaction.payee
  //   });
  // }

  const linkedAccount = transaction.to_account_id ? {
    id: transaction.to_account_id,
    name: transaction.to_account_name || "Unknown Account"
  } : null;

  const isIgnored = transaction.is_ignored || false;
  const isUncategorized = categoryName === "Uncategorized";
  const isPending = transaction.status_name === "Pending";
  const isStartingBalance = (transaction as any).category_id === -3;
  const isOptimistic = transaction.id < 0; // Optimistic transactions have negative IDs
  const isFuture = toISODateString(transaction.payment_date) > getTodayISO();
  const isSplitTransaction = splitCount >= 2;
  const displayAmount = totalAmount ?? transaction.amount;

  // For split transactions: show the lone split observation if only one has notes,
  // "…" if multiple splits have notes, otherwise fall back to the transaction-level notes.
  const displayNotes = (() => {
    if (!isSplitTransaction || !splits || splits.length === 0) return transaction.notes || '';
    const withNotes = splits.filter(s => s.split_observation?.trim());
    if (withNotes.length === 0) return transaction.notes || '';
    if (withNotes.length === 1) return withNotes[0].split_observation!;
    return '…';
  })();

  const rowClassName = cn(
    "group border-b border-gray-200 dark:border-gray-700",
    isSplitTransaction && "border-l-2 border-l-violet-400 dark:border-l-violet-500",
    isSpecialTransaction && "bg-muted/30",
    isIgnored && "opacity-50 italic",
    isPending ? "font-bold" : "opacity-60",
    isFuture && "italic text-gray-400 dark:text-gray-500",
    isOptimistic && "opacity-60 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800",
    // Red highlighting for failed batch edits takes precedence over blue selection highlighting
    hasBatchEditFailed ? "border-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40" :
    isSelected ? "bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800" :
    "hover:bg-gray-50 dark:hover:bg-gray-800/50"
  );

  return (
    <>
      <tr key={transaction.id} className={rowClassName} {...bindDoubleTap(handleEditClick)}>
      <td className="px-4 text-sm h-[25px]">
        <div className="flex items-center gap-2">
          <div 
            onClick={(event) => {
              const newChecked = !isSelected;
              handleSelectTransaction(transaction, newChecked, event);
            }}
            className="cursor-pointer flex items-center justify-center h-4 w-4"
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {}} // Prevent default behavior, we handle it in the div onClick
            />
          </div>
          {hasBatchEditFailed && failedTransactionError && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{failedTransactionError}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </td>
      {/* Tag column */}
      <td className="px-1 text-sm h-[25px] w-[15px]">
        <TagPickerCell transaction={transaction} onOpenDetail={(id, name, color) => setDetailTag({ id, name, color })} />
      </td>
      <td className="px-4 text-sm h-[25px] whitespace-nowrap">{formattedDate}</td>
      <td className="px-4 text-sm h-[25px] max-w-[180px]">
        <div
          className="truncate"
          title={
            isTransfer
              ? (parseFloat(transaction.amount) < 0
                  ? t('Transfer → {{name}}', { name: linkedAccount?.name || t('Unknown account') })
                  : t('{{name}} → Transfer', { name: linkedAccount?.name || t('Unknown account') }))
              : isPayment
                ? (parseFloat(transaction.amount) < 0
                    ? t('Payment → {{name}}', { name: linkedAccount?.name || t('External account') })
                    : t('{{name}} → Payment', { name: linkedAccount?.name || t('External account') }))
                : transaction.payee || ""
          }
        >
          <div className="flex items-center gap-2">
            {isOptimistic && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
            )}
            {isTransfer ? (
              <span className="text-muted-foreground italic">
                {parseFloat(transaction.amount) < 0
                  ? t('Transfer → {{name}}', { name: linkedAccount?.name || t('Unknown account') })
                  : t('{{name}} → Transfer', { name: linkedAccount?.name || t('Unknown account') })
                }
              </span>
            ) : isPayment ? (
              <span className="text-muted-foreground italic">
                {parseFloat(transaction.amount) < 0
                  ? t('Payment → {{name}}', { name: linkedAccount?.name || t('External account') })
                  : t('{{name}} → Payment', { name: linkedAccount?.name || t('External account') })
                }
              </span>
            ) : (
              transaction.payee || ""
            )}
          </div>
        </div>
      </td>
      <td className="px-4 text-sm h-[25px]">
        {isSpecialTransaction ? (
          <div className="flex items-center">
            <span className="text-muted-foreground italic">
              {isTransfer ? t('Transfer') : t('Payment')}
            </span>
            <Tag className="h-4 w-4 ml-1 text-muted-foreground" />
          </div>
        ) : isSplitTransaction ? (
          <div
            className="flex items-center gap-1 cursor-pointer select-none"
            onClick={() => onToggleExpand?.(transaction.id)}
          >
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
            }
            <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
              {t('Split · {{count}}', { count: splitCount })}
            </span>
          </div>
        ) : (
          <div className="flex items-center">
            <span className={cn("p-1",
              isUncategorized && !isIgnored && "bg-yellow-100 dark:bg-yellow-900/50 rounded-md"
            )}>
              {transaction.category_group_name || ""}: {categoryName}
            </span>
          </div>
        )}
      </td>
      <td className="hidden md:table-cell px-4 text-sm h-[25px] max-w-[150px]">
        <div
          className="truncate"
          title={displayNotes}
        >
          {displayNotes}
        </div>
      </td>
      <td className="hidden md:table-cell px-4 text-sm h-[25px]">{accountName}</td>
      <td
        className={`px-4 text-sm whitespace-nowrap ${isSpecialTransaction ? "text-muted-foreground" : parseFloat(displayAmount) > 0 ? "text-green-600 dark:text-green-400" : "text-foreground"} text-right`}
      >
        {parseFloat(displayAmount) < 0
          ? `-${formatCurrency(Math.abs(parseFloat(displayAmount)), currency)}`
          : formatCurrency(parseFloat(displayAmount), currency)}
      </td>
      <td className="hidden md:table-cell px-4 text-sm h-[25px] max-w-[100px] text-center w-full">
        {transaction.is_installment &&
        transaction.installment_number &&
        transaction.installment_total ? (
          <span>
            {String(transaction.installment_number).padStart(2, "0")}/
            {String(transaction.installment_total).padStart(2, "0")}
          </span>
        ) : (
          ""
        )}
      </td>
      <td className="px-4 text-sm h-[25px]">
        <div className="flex items-center gap-1">
          {/* Edit — revealed on row hover, mirrors the mobile card's pencil. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            onClick={handleEditClick}
            disabled={isOptimistic}
            aria-label={t('Edit')}
          >
            <Edit className="h-4 w-4 text-gray-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              // Cycle: Pending (1) → Cleared (2) → Pending (1)
              const statusNameToId: Record<string, number> = { Pending: 1, Cleared: 2 };
              const cycle: Record<number, number> = { 1: 2, 2: 1 };
              const currentStatusId = statusNameToId[transaction.status_name] ?? 1;
              const newStatus = cycle[currentStatusId] ?? 1;
              handleStatusChange(transaction.id, currentStatusId, newStatus);
            }}
          >
            {transaction.is_reconciled ? (
              <LockFilled className="h-4 w-4 text-green-600" />
            ) : (
              <>
                {transaction.status_name === 'Pending' && (
                  <CheckCircleEmpty className="h-4 w-4 text-gray-500" />
                )}

                {transaction.status_name === 'Cleared' && (
                  <CheckCircleFilled className="h-5 w-5 text-green-500" />
                )}
              </>
            )}
          </Button>
          {/*<DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              Dropdown menu can be used for other future options if needed 
            </DropdownMenuContent>
          </DropdownMenu>*/}
        </div>
      </td>

      {/* Ignore Column */}
      <td className="hidden md:table-cell px-2 py-1 text-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleIgnoreToggle(transaction.id, isIgnored)}
                disabled={isOptimistic}
              >
                {isIgnored ? (
                  <EyeOff className="h-4 w-4 text-gray-500" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-600" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isIgnored ? t('Show in reports') : t('Hide from reports')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      
      {/* Buffer column for scrollbar clearance */}
      <td className="w-[20px]"></td>
      
      </tr>
      
      {/* Starting Balance Warning Dialog */}
      <AlertDialog open={showStartingBalanceWarning} onOpenChange={setShowStartingBalanceWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Edit Starting Balance Transaction')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('⚠️ This is an opening balance transaction. Modifying it will affect your account balance history. Do you want to continue?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowStartingBalanceWarning(false);
                if (transaction.is_reconciled && onReconciledEdit) {
                  onReconciledEdit(transaction);
                } else {
                  onEditTransaction(transaction);
                }
              }}
            >
              {t('Continue Editing')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailTag && (
        <TagDetail
          tagId={detailTag.id}
          tagName={detailTag.name}
          tagColor={detailTag.color}
          onClose={() => setDetailTag(null)}
        />
      )}
    </>
  );
};

export default TransactionRowDisplay;

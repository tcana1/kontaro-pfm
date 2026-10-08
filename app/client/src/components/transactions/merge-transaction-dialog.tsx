import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDateForDisplay } from '@/lib/date-utils';
import { formatCurrency, type CurrencyCode } from '@/lib/currency-formatter';
import { useFinance } from '@/contexts/finance-context';
import { cn } from '@/lib/utils';
import { Merge } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchTransactionSplit {
  id: number;
  category_id: number | null;
  amount: string | number;
  observation: string | null;
  categories: {
    id: number;
    name: string;
    category_groups: { name: string; emoji: string } | null;
  } | null;
}

export interface MatchTransactionSide {
  id: number;
  payee: string;
  amount: string | number;
  payment_date: string;
  purchase_date: string;
  created_at: string;
  account_id: number;
  transaction_splits: MatchTransactionSplit[];
}

export interface MatchCandidate {
  id: number;
  transaction_a: MatchTransactionSide;
  transaction_b: MatchTransactionSide;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstSplit(tx: MatchTransactionSide): MatchTransactionSplit | undefined {
  return tx.transaction_splits?.[0];
}

function categoryName(tx: MatchTransactionSide): string {
  return firstSplit(tx)?.categories?.name ?? 'No category';
}

function notes(tx: MatchTransactionSide): string {
  return firstSplit(tx)?.observation ?? '';
}

function createdAtLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function splitCategoryLabel(s: MatchTransactionSplit): string {
  if (!s.categories) return 'No category';
  const group = s.categories.category_groups;
  return group?.emoji ? `${group.emoji} ${s.categories.name}` : s.categories.name;
}

// ── Field row ─────────────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  valueA: string;
  valueB: string;
  field: string;
  selected: 'a' | 'b';
  onSelect: (field: string, side: 'a' | 'b') => void;
  emptyLabel?: string;
}

const FieldRow: React.FC<FieldRowProps> = ({ label, valueA, valueB, field, selected, onSelect, emptyLabel = '—' }) => {
  const aEmpty = !valueA;
  const bEmpty = !valueB;

  return (
    <div className="grid grid-cols-[120px_1fr_1fr] items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>

      {/* Transaction A option */}
      <label
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer text-sm transition-colors',
          selected === 'a'
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 dark:ring-blue-700'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
        )}
        onClick={() => onSelect(field, 'a')}
      >
        <input
          type="radio"
          name={field}
          value="a"
          checked={selected === 'a'}
          onChange={() => onSelect(field, 'a')}
          className="accent-blue-500"
        />
        <span className={cn(aEmpty && 'text-gray-400 italic')}>{valueA || emptyLabel}</span>
      </label>

      {/* Transaction B option */}
      <label
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer text-sm transition-colors',
          selected === 'b'
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 dark:ring-blue-700'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
        )}
        onClick={() => onSelect(field, 'b')}
      >
        <input
          type="radio"
          name={field}
          value="b"
          checked={selected === 'b'}
          onChange={() => onSelect(field, 'b')}
          className="accent-blue-500"
        />
        <span className={cn(bEmpty && 'text-gray-400 italic')}>{valueB || emptyLabel}</span>
      </label>
    </div>
  );
};

// ── Split structure selector ───────────────────────────────────────────────────

interface SplitSelectorProps {
  a: MatchTransactionSide;
  b: MatchTransactionSide;
  selected: 'winner' | 'loser';
  onSelect: (src: 'winner' | 'loser') => void;
  currency: string;
}

const SplitSelector: React.FC<SplitSelectorProps> = ({ a, b, selected, onSelect, currency }) => {
  const { t } = useTranslation();
  const options: { src: 'winner' | 'loser'; label: string; tx: MatchTransactionSide }[] = [
    { src: 'winner', label: createdAtLabel(a.created_at), tx: a },
    { src: 'loser',  label: createdAtLabel(b.created_at), tx: b },
  ];

  const aAmount = parseFloat(String(a.amount));
  const bAmount = parseFloat(String(b.amount));
  const diff = parseFloat((bAmount - aAmount).toFixed(2));
  const showDiffWarning = selected === 'winner' && a.transaction_splits.length > 1 && diff !== 0;
  const lastSplit = a.transaction_splits[a.transaction_splits.length - 1];

  return (
    <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('Split structure')}</p>
      <div className="space-y-1">
        {options.map(({ src, label, tx }) => (
          <label
            key={src}
            className={cn(
              'flex items-start gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors',
              selected === src
                ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 dark:ring-blue-700'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
            onClick={() => onSelect(src)}
          >
            <input
              type="radio"
              checked={selected === src}
              onChange={() => onSelect(src)}
              className="accent-blue-500 mt-0.5 shrink-0"
            />
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {label} · {t('{{count}} split(s)', { count: tx.transaction_splits.length })}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {tx.transaction_splits.map((s) => (
                  <div key={s.id} className="flex justify-between gap-4 text-xs text-gray-400">
                    <span className="truncate">
                      {splitCategoryLabel(s)}{s.observation ? ` · ${s.observation}` : ''}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {formatCurrency(parseFloat(String(s.amount)), currency as CurrencyCode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </label>
        ))}
      </div>
      {showDiffWarning && lastSplit && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          ⚠️ "{splitCategoryLabel(lastSplit)}" will be adjusted from {formatCurrency(parseFloat(String(lastSplit.amount)), currency as CurrencyCode)} → {formatCurrency(parseFloat(String(lastSplit.amount)) + diff, currency as CurrencyCode)} to match the total of {formatCurrency(bAmount, currency as CurrencyCode)}.
        </p>
      )}
    </div>
  );
};

// ── Dialog ────────────────────────────────────────────────────────────────────

interface MergeTransactionDialogProps {
  candidate: MatchCandidate | null;
  open: boolean;
  onClose: () => void;
  onMerge: (
    winnerId: number,
    loserId: number,
    resolvedFields: {
      payee?: string;
      payment_date?: string;
      purchase_date?: string;
      category_id?: number | null;
      notes?: string | null;
    },
    matchCandidateId: number,
    splitSource?: 'winner' | 'loser'
  ) => Promise<void>;
  onDismiss: (matchCandidateId: number) => Promise<void>;
}

type FieldSelections = Record<string, 'a' | 'b'>;

export const MergeTransactionDialog: React.FC<MergeTransactionDialogProps> = ({
  candidate,
  open,
  onClose,
  onMerge,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const { currency, locale, dateFormat } = useFinance();
  const [selections, setSelections] = useState<FieldSelections>({});
  const [splitSource, setSplitSource] = useState<'winner' | 'loser'>('winner');
  const [loading, setLoading] = useState(false);

  // Reset selections when candidate changes
  React.useEffect(() => {
    if (!candidate) return;
    const a = candidate.transaction_a;
    const b = candidate.transaction_b;
    setSelections({
      payee: 'a',
      payment_date: 'a',
      purchase_date: 'a',
      amount: 'a',
      category: categoryName(a) !== 'No category' ? 'a' : categoryName(b) !== 'No category' ? 'b' : 'a',
      notes: notes(a) ? 'a' : notes(b) ? 'b' : 'a',
    });
    // Default split source: side with more splits (typically the manual entry)
    setSplitSource(a.transaction_splits.length >= b.transaction_splits.length ? 'winner' : 'loser');
  }, [candidate?.id]);

  const handleSelect = (field: string, side: 'a' | 'b') => {
    setSelections(prev => ({ ...prev, [field]: side }));
  };

  const handleMerge = async () => {
    if (!candidate) return;
    setLoading(true);
    try {
      const a = candidate.transaction_a;
      const b = candidate.transaction_b;
      const sel = selections;
      const needsSplitChoice = a.transaction_splits.length > 1 || b.transaction_splits.length > 1;

      const get = (field: string, valA: string | null | undefined, valB: string | null | undefined) =>
        sel[field] === 'b' ? valB : valA;

      const resolvedFields: Parameters<typeof onMerge>[2] = {
        payee: get('payee', a.payee, b.payee) ?? undefined,
        payment_date: get('payment_date', a.payment_date, b.payment_date) ?? undefined,
        purchase_date: get('purchase_date', a.purchase_date, b.purchase_date) ?? undefined,
      };

      if (!needsSplitChoice) {
        // Winner is the side whose amount the user chose (defaults to 'a')
        const winnerSide = sel['amount'] ?? 'a';
        const [winnerId, loserId] = winnerSide === 'a' ? [a.id, b.id] : [b.id, a.id];
        const otherTx = winnerSide === 'a' ? b : a;

        // Category/notes: include in resolved only if the user picked the OTHER side
        // (winner already has its own; we only need to override when crossing sides)
        if ((sel['category'] ?? 'a') !== winnerSide) {
          resolvedFields.category_id = firstSplit(otherTx)?.category_id ?? null;
        }
        if ((sel['notes'] ?? 'a') !== winnerSide) {
          resolvedFields.notes = notes(otherTx) || null;
        }

        await onMerge(winnerId, loserId, resolvedFields, candidate.id, 'winner');
      } else {
        // Multi-split: winner is always transaction_a, user picks which split structure
        await onMerge(a.id, b.id, resolvedFields, candidate.id, splitSource);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!candidate) return;
    setLoading(true);
    try {
      await onDismiss(candidate.id);
    } finally {
      setLoading(false);
    }
  };

  if (!candidate) return null;

  const a = candidate.transaction_a;
  const b = candidate.transaction_b;
  const needsSplitChoice = a.transaction_splits.length > 1 || b.transaction_splits.length > 1;
  const amountsDiffer = !needsSplitChoice &&
    parseFloat(String(a.amount)) !== parseFloat(String(b.amount));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-orange-500" />
            {t('Possible duplicate detected')}
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            {t('Select which data to keep')}
          </p>
        </DialogHeader>

        {/* Column headers */}
        <div className="grid grid-cols-[120px_1fr_1fr] gap-2 mb-1">
          <div />
          <div className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 px-3">
            {createdAtLabel(a.created_at)}
            <div className="text-[10px] font-normal text-gray-400">
              {formatCurrency(parseFloat(String(a.amount)), currency)}
            </div>
          </div>
          <div className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 px-3">
            {createdAtLabel(b.created_at)}
            <div className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
              {formatCurrency(parseFloat(String(b.amount)), currency)}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-1">
          <FieldRow
            label={t('Payee')}
            valueA={a.payee}
            valueB={b.payee}
            field="payee"
            selected={selections['payee'] ?? 'a'}
            onSelect={handleSelect}
          />
          <FieldRow
            label={t('Payment date')}
            valueA={formatDateForDisplay(a.payment_date, locale, dateFormat)}
            valueB={formatDateForDisplay(b.payment_date, locale, dateFormat)}
            field="payment_date"
            selected={selections['payment_date'] ?? 'a'}
            onSelect={handleSelect}
          />
          <FieldRow
            label={t('Purchase date')}
            valueA={formatDateForDisplay(a.purchase_date, locale, dateFormat)}
            valueB={formatDateForDisplay(b.purchase_date, locale, dateFormat)}
            field="purchase_date"
            selected={selections['purchase_date'] ?? 'a'}
            onSelect={handleSelect}
          />
          {/* Category and Notes only shown in single-split case; multi-split uses SplitSelector below */}
          {!needsSplitChoice && (
            <>
              {amountsDiffer && (
                <FieldRow
                  label={t('Amount')}
                  valueA={formatCurrency(parseFloat(String(a.amount)), currency)}
                  valueB={formatCurrency(parseFloat(String(b.amount)), currency)}
                  field="amount"
                  selected={selections['amount'] ?? 'a'}
                  onSelect={handleSelect}
                />
              )}
              <FieldRow
                label={t('Category')}
                valueA={categoryName(a)}
                valueB={categoryName(b)}
                field="category"
                selected={selections['category'] ?? 'a'}
                onSelect={handleSelect}
              />
              <FieldRow
                label={t('Notes')}
                valueA={notes(a)}
                valueB={notes(b)}
                field="notes"
                selected={selections['notes'] ?? 'a'}
                onSelect={handleSelect}
                emptyLabel={t('no notes')}
              />
            </>
          )}
        </div>

        {needsSplitChoice && (
          <SplitSelector
            a={a}
            b={b}
            selected={splitSource}
            onSelect={setSplitSource}
            currency={currency}
          />
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('Cancel')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDismiss} disabled={loading}>
              {t('Not a duplicate')}
            </Button>
            <Button onClick={handleMerge} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
              {loading ? t('Merging...') : t('Merge')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

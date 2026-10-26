import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateForDisplay } from '@/lib/date-utils';
import { useMoney } from '@/hooks/useMoney';
import { useFinance } from '@/contexts/finance-context';
import { Layers, AlertTriangle } from 'lucide-react';
import type { Transaction } from '@shared/schema';

interface CollapseDialogProps {
  open: boolean;
  transactions: Transaction[];
  onClose: () => void;
  onCollapse: (
    baseId: number,
    otherIds: number[],
    resolvedFields: { payee?: string; payment_date?: string; purchase_date?: string }
  ) => Promise<void>;
}

function txDateLabel(txItem: Transaction | undefined, field: 'payment_date' | 'purchase_date', locale?: string, dateFormat?: string): string {
  if (!txItem) return '—';
  const raw = (txItem as any)[field] as string | undefined;
  return raw ? formatDateForDisplay(raw, locale, dateFormat) : '—';
}

const CollapseDialog: React.FC<CollapseDialogProps> = ({
  open,
  transactions,
  onClose,
  onCollapse,
}) => {
  const { t } = useTranslation();
  const { locale, dateFormat } = useFinance();
  const money = useMoney();
  const [baseId, setBaseId] = useState<number | null>(null);
  const [fieldSource, setFieldSource] = useState<{ payee: number; payment_date: number; purchase_date: number }>({
    payee: 0,
    payment_date: 0,
    purchase_date: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || transactions.length === 0) return;
    // Default base: transaction with most splits
    const defaultBase = [...transactions].sort(
      (a, b) => ((b as any).splits?.length ?? 0) - ((a as any).splits?.length ?? 0)
    )[0];
    setBaseId(defaultBase.id);
    setFieldSource({ payee: defaultBase.id, payment_date: defaultBase.id, purchase_date: defaultBase.id });
  }, [open, transactions]);

  if (!open || transactions.length < 2 || !baseId) return null;

  const otherIds = transactions.filter(txn => txn.id !== baseId).map(txn => txn.id);
  const totalAmount = transactions.reduce((sum, t) => sum + parseFloat((t as any).amount ?? '0'), 0);

  const handleCollapse = async () => {
    setLoading(true);
    try {
      const src = (field: keyof typeof fieldSource) => transactions.find(txn => txn.id === fieldSource[field]);
      const resolved: { payee?: string; payment_date?: string; purchase_date?: string } = {};
      const payeeTx = src('payee');
      const pdTx = src('payment_date');
      const purchTx = src('purchase_date');
      if (payeeTx) resolved.payee = payeeTx.payee;
      if (pdTx) resolved.payment_date = pdTx.payment_date;
      if (purchTx) resolved.purchase_date = purchTx.purchase_date;
      await onCollapse(baseId, otherIds, resolved);
    } catch (e) {
      console.error('[Collapse] failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const txAmountLabel = (txn: Transaction) => {
    const amt = parseFloat((txn as any).amount ?? '0');
    return `${amt < 0 ? '-' : ''}${money(Math.abs(amt))}`;
  };

  const fieldRow = (
    label: string,
    field: keyof typeof fieldSource,
    displayFn: (txn: Transaction) => string,
    itemLabelFn?: (txn: Transaction) => string,
  ) => (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-28 shrink-0">{label}</span>
      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
        {displayFn(transactions.find(txn => txn.id === fieldSource[field])!)}
      </span>
      <Select
        value={String(fieldSource[field])}
        onValueChange={v => setFieldSource(prev => ({ ...prev, [field]: Number(v) }))}
      >
        <SelectTrigger className="w-48 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {transactions.map(txn => (
            <SelectItem key={txn.id} value={String(txn.id)}>
              {(itemLabelFn ?? displayFn)(txn)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setBaseId(null); setFieldSource({ payee: 0, payment_date: 0, purchase_date: 0 }); onClose(); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-500" />
            {t('Combine {{count}} transactions into 1', { count: transactions.length })}
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            {t('All splits are merged into one transaction. The resulting total is the sum of all.')}
          </p>
        </DialogHeader>

        {/* Base selection */}
        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('Base transaction')}</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {transactions.map(txn => {
              const isBase = txn.id === baseId;
              const splitCount = (txn as any).splits?.length ?? 1;
              return (
                <label
                  key={txn.id}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                    isBase
                      ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 dark:ring-blue-700'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setBaseId(txn.id);
                    setFieldSource({ payee: txn.id, payment_date: txn.id, purchase_date: txn.id });
                  }}
                >
                  <input
                    type="radio"
                    name="base"
                    checked={isBase}
                    onChange={() => {}}
                    className="accent-blue-500"
                  />
                  <span className="text-sm flex-1 truncate">{txn.payee}</span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {splitCount > 1 ? `${splitCount} splits · ` : ''}
                    {txAmountLabel(txn)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Field resolution */}
        <div className="mt-2">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t('Resulting transaction fields')}</p>
          <div className="px-1">
            {fieldRow(t('Payee'), 'payee', txn => { const p = txn.payee ?? '—'; return p.length > 17 ? p.slice(0, 17) + '…' : p; }, txn => `${txn.payee ?? '—'} · ${txAmountLabel(txn)}`)}
            {fieldRow(t('Pay date'), 'payment_date', txn => txDateLabel(txn, 'payment_date', locale, dateFormat))}
            {fieldRow(t('Purchase date'), 'purchase_date', txn => txDateLabel(txn, 'purchase_date', locale, dateFormat))}
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mt-1">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('Result: 1 transaction with {{splits}} splits, total {{total}}.', {
              splits: transactions.reduce((n, txn) => n + ((txn as any).splits?.length ?? 1), 0),
              total: `${totalAmount < 0 ? '-' : ''}${money(Math.abs(totalAmount))}`
            })}{' '}
            {transactions.length - 1 === 1
              ? t('The other transaction will be permanently deleted.')
              : t('The other {{count}} transactions will be permanently deleted.', { count: transactions.length - 1 })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>{t('Cancel')}</Button>
          <Button onClick={handleCollapse} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? t('Combining...') : t('Combine')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CollapseDialog;

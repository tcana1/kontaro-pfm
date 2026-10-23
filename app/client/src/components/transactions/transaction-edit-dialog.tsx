import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import { ChevronDown, X, Plus, Check, Loader2 } from 'lucide-react';
import { getTodayISO, localDateFromString, localDateString } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import PayeeInput from './inline-form-fields/payee-input';
import AmountInput from './inline-form-fields/amount-input';
import TransactionEditFields from './transaction-edit-fields';
import type { Transaction, Tag as TagType } from '@shared/schema';
import { tKey } from '@/lib/i18n-keys';

const TAG_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#6B7280', '#0EA5E9', '#F97316', '#14B8A6',
];

interface MobileEditTransaction extends Transaction {
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
  split_id: number;
  splits?: any[];
}

interface Props {
  transaction: MobileEditTransaction | null;
  isAdding?: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const formSchema = z.object({
  id: z.number().optional(),
  accountId: z.string().min(1, tKey('Required')),
  paymentDate: z.string().min(1, tKey('Required')),
  payee: z.string().min(1, tKey('Required')),
  amount: z.string().min(1, tKey('Required')),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
  toAccountId: z.string().optional(),
  type: z.string().optional(),
  statusId: z.string(),
  isIgnored: z.string(),
});

type FormData = z.infer<typeof formSchema>;

const TransactionEditDialog: React.FC<Props> = ({ transaction, isAdding, onSave, onCancel, isSaving }) => {
  const { t } = useTranslation();
  const te = (message?: string) => (message ? t(message) : undefined);
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());

  // ── Tag picker state ────────────────────────────────────────────────────────
  const [tagOpen, setTagOpen] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [localTagId, setLocalTagId] = useState<number | null>(transaction?.tag_id ?? null);

  const queryClient = useQueryClient();
  const { data: tags = [] } = useServiceQuery<TagType[]>('tags');

  const setTagMutation = useMutation({
    mutationFn: (tagId: number | null) => supabaseService.setTransactionTag(transaction!.id, tagId),
    onSuccess: (_, tagId) => {
      setLocalTagId(tagId);
      CacheUtils.invalidateTransactionRelated(queryClient);
      CacheUtils.invalidateTagRelated(queryClient);
      setTagOpen(false);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async () => supabaseService.createTag(newTagName.trim(), newTagColor),
    onSuccess: async (tag) => {
      CacheUtils.invalidateTagRelated(queryClient);
      if (tag?.id && transaction?.id) {
        await supabaseService.setTransactionTag(transaction.id, tag.id);
        setLocalTagId(tag.id);
        CacheUtils.invalidateTransactionRelated(queryClient);
      }
      setCreatingTag(false);
      setNewTagName('');
      setNewTagColor('#3B82F6');
      setTagOpen(false);
    },
  });
  // ────────────────────────────────────────────────────────────────────────────

  const defaultValues = useMemo(() => ({
    id: transaction?.id,
    accountId: transaction?.account_id?.toString() || '',
    paymentDate: transaction?.payment_date || getTodayISO(),
    payee: transaction?.payee || '',
    amount: transaction?.amount || '',
    categoryId: (transaction as any)?.category_id?.toString() || transaction?.splits?.[0]?.category_id?.toString() || '',
    notes: transaction?.notes || '',
    toAccountId: transaction?.to_account_id?.toString() || '',
    type: transaction?.type || 'transaction',
    statusId: ((transaction as any)?.status_id ?? 1).toString(),
    isIgnored: String(!!(transaction as any)?.is_ignored),
  }), [transaction]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: 'onSubmit',
  });

  const { handleSubmit, watch, setValue, formState: { errors } } = form;

  const onSubmit = (data: FormData) => {
    if (!data.categoryId || data.categoryId.trim() === '') {
      form.setError('categoryId', { message: tKey('Required') });
      return;
    }
    onSave({
      id: data.id,
      accountId: data.accountId ? parseInt(data.accountId) : null,
      paymentDate: data.paymentDate,
      payee: data.payee,
      amount: parseFloat(data.amount),
      categoryId: data.categoryId ? parseInt(data.categoryId) : null,
      notes: data.notes || '',
      toAccountId: data.toAccountId ? parseInt(data.toAccountId) : null,
      type: data.type,
      isInstallment: transaction?.is_installment || false,
      installmentNumber: transaction?.installment_number || null,
      installmentTotal: transaction?.installment_total || null,
      splitId: transaction?.split_id,
      removeFromReconciliation: false,
      ...(!isAdding && transaction && Number(data.statusId) !== Number((transaction as any).status_id)
        ? { statusId: Number(data.statusId) }
        : {}),
      ...(!isAdding && transaction && (data.isIgnored === 'true') !== !!(transaction as any).is_ignored
        ? { isIgnored: data.isIgnored === 'true' }
        : {}),
    });
  };

  const handleFieldLock = (field: string, locked: boolean) => {
    setLockedFields(prev => {
      const next = new Set(prev);
      locked ? next.add(field) : next.delete(field);
      return next;
    });
  };

  // Reset form and tag state when transaction changes or switching to add mode
  React.useEffect(() => {
    form.reset(defaultValues);
    setLocalTagId(transaction?.tag_id ?? null);
    setTagOpen(false);
    setCreatingTag(false);
    setNewTagName('');
  }, [transaction?.id, isAdding]);

  const dateValue = localDateFromString(watch('paymentDate'));

  return (
    <Dialog open={!!transaction || !!isAdding} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        className="sm:max-w-md max-h-[90dvh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isAdding ? t('Add Transaction') : t('Edit Transaction')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <TransactionEditFields
            mode="single"
            date={dateValue}
            onDateChange={(date) => setValue('paymentDate', date ? localDateString(date) : '', { shouldDirty: true })}
            dateError={te(errors.paymentDate?.message)}
            showStatusAndIgnore={!isAdding}
            statusId={watch('statusId')}
            onStatusChange={(v) => setValue('statusId', v, { shouldDirty: true })}
            isIgnored={watch('isIgnored')}
            onIsIgnoredChange={(v) => setValue('isIgnored', v, { shouldDirty: true })}
            categoryId={watch('categoryId') || ''}
            onCategoryChange={(v) => setValue('categoryId', v, { shouldDirty: true })}
            categoryRestriction={{ disabled: lockedFields.has('category') }}
            categoryError={te(errors.categoryId?.message)}
            accountId={watch('accountId')}
            onAccountChange={(v) => setValue('accountId', v, { shouldDirty: true })}
            accountError={te(errors.accountId?.message)}
            notes={watch('notes') || ''}
            onNotesChange={(v) => setValue('notes', v, { shouldDirty: true })}
            afterDateStatus={
              <>
                <div className="space-y-2">
                  <Label>{t('Payee')}</Label>
                  <PayeeInput
                    size="default"
                    value={watch('payee')}
                    onChange={(v) => setValue('payee', v, { shouldDirty: true })}
                    error={te(errors.payee?.message)}
                    onToAccountIdChange={(id) => setValue('toAccountId', id ? id.toString() : '', { shouldDirty: true })}
                    onCategoryChange={(id) => {
                      if (!lockedFields.has('category')) setValue('categoryId', id.toString(), { shouldDirty: true });
                    }}
                    onTypeChange={(type) => {
                      if (!lockedFields.has('type')) setValue('type', type, { shouldDirty: true });
                    }}
                    currentAccountId={transaction?.account_id ?? undefined}
                    onFieldLock={handleFieldLock}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('Amount')}</Label>
                  <AmountInput
                    size="default"
                    value={watch('amount')}
                    onChange={(v) => setValue('amount', v, { shouldDirty: true })}
                    error={te(errors.amount?.message)}
                  />
                </div>
              </>
            }
            afterNotes={
                !isAdding && transaction && (
                  <div className="space-y-2">
                    <Label>{t('Tag')}</Label>
                    {!tagOpen ? (
                      <button
                        type="button"
                        onClick={() => setTagOpen(true)}
                        className="w-full flex items-center justify-between h-10 px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-accent"
                      >
                        {localTagId && tags.find(tag => tag.id === localTagId) ? (
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tags.find(tag => tag.id === localTagId)!.color }} />
                            <span>{tags.find(tag => tag.id === localTagId)!.name}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t('No tag')}</span>
                        )}
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      <div className="border border-input rounded-md bg-background overflow-hidden">
                        {localTagId && (
                          <button
                            type="button"
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 border-b border-gray-100 dark:border-gray-700"
                            onClick={() => setTagMutation.mutate(null)}
                            disabled={setTagMutation.isPending}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t('Remove tag')}
                          </button>
                        )}
                        {tags.map(tag => (
                          <button
                            key={tag.id}
                            type="button"
                            className={cn(
                              "flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-accent border-b border-gray-100 dark:border-gray-700",
                              localTagId === tag.id && "font-medium"
                            )}
                            onClick={() => setTagMutation.mutate(tag.id)}
                            disabled={setTagMutation.isPending}
                          >
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            <span className="flex-1 text-left">{tag.name}</span>
                            {localTagId === tag.id && <Check className="h-3.5 w-3.5 text-blue-500" />}
                          </button>
                        ))}
                        {!creatingTag ? (
                          <button
                            type="button"
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent border-b border-gray-100 dark:border-gray-700"
                            onClick={() => setCreatingTag(true)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t('New tag')}
                          </button>
                        ) : (
                          <div className="px-3 py-2.5 space-y-2 border-b border-gray-100 dark:border-gray-700">
                            <input
                              autoFocus
                              type="text"
                              value={newTagName}
                              onChange={e => setNewTagName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && newTagName.trim()) createTagMutation.mutate();
                                if (e.key === 'Escape') { setCreatingTag(false); setNewTagName(''); }
                              }}
                              placeholder={t('Tag name')}
                              className="w-full text-sm px-2 py-1.5 rounded border border-input bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <div className="flex flex-wrap gap-2">
                              {TAG_COLORS.map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  className={cn("w-5 h-5 rounded-full transition-transform", newTagColor === c && "ring-2 ring-offset-1 ring-gray-400 scale-110")}
                                  style={{ backgroundColor: c }}
                                  onClick={() => setNewTagColor(c)}
                                />
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="flex-1 text-sm py-1.5 rounded border border-input hover:bg-accent text-muted-foreground"
                                onClick={() => { setCreatingTag(false); setNewTagName(''); }}
                              >
                                {t('Cancel')}
                              </button>
                              <button
                                type="button"
                                disabled={!newTagName.trim() || createTagMutation.isPending}
                                className="flex items-center justify-center gap-1 flex-1 text-sm py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                                onClick={() => createTagMutation.mutate()}
                              >
                                {createTagMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5" /> {t('Create')}</>}
                              </button>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          className="flex items-center justify-center w-full px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
                          onClick={() => { setTagOpen(false); setCreatingTag(false); setNewTagName(''); }}
                        >
                          {t('Close')}
                        </button>
                      </div>
                    )}
                  </div>
                )
            }
          />

          <DialogFooter className="flex gap-2 sm:gap-0 sm:justify-between justify-between items-stretch sm:items-center pt-4">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={isSaving}>
              {t('Cancel')}
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={isSaving}>
              {isSaving ? <Spinner className="h-4 w-4" /> : t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionEditDialog;

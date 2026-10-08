import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, X, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useRouteContext } from '@/hooks/useRouteContext';
import { SingleEditValidator, type SingleEditRestrictions } from '@/utils/batch-edit-validator';

import AmountInput from './inline-form-fields/amount-input';
import HybridDateInput from './inline-form-fields/hybrid-date-input';
import PayeeInput from './inline-form-fields/payee-input';
import CategorySelect from './inline-form-fields/category-select';
import AccountSelect from './inline-form-fields/account-select';
import NotesInput from './inline-form-fields/notes-input';
import InstallmentInput from './inline-form-fields/installment-input';
import EditableSplitRow from './editable-split-row';

import type { Transaction } from '@shared/schema';
import { getTodayISO } from '@/lib/date-utils';
import { validateInstallment } from '@/utils/transaction-utils';
import { useToast } from '@/hooks/use-toast';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';
import { supabaseService } from '@/services/supabase-service';
import ReconciliationWarningDialog from './reconciliation-warning-dialog';
import { tKey } from '@/lib/i18n-keys';

interface EditableTransactionRowProps {
  transaction?: Transaction & {
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
  } | null;
  onSave: (data: any) => void;
  onCancel: (data: any) => void;
  isNew?: boolean;
  showActions?: boolean;
  isSaving?: boolean;
  currentAccountId?: number;
}

const formSchema = z.object({
  id: z.number().optional(),
  accountId: z.string().min(1, tKey('Required')),
  paymentDate: z.string().min(1, tKey('Required')),
  payee: z.string().min(1, tKey('Required')),
  amount: z.string().min(1, tKey('Required')),
  categoryId: z.string().optional(), // validated manually when not in split mode
  notes: z.string().optional(),
  toAccountId: z.string().optional(),
  type: z.string().optional(),
  installment: z.string().optional(),
  is_installment: z.boolean().optional(),
  splitId: z.number().optional(),
}).superRefine((data, ctx) => {
  if (!data.installment) return;
  const error = validateInstallment(data.installment);
  if (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error === 'range'
        ? tKey("Current installment must be between 1 and the total")
        : tKey("Installment must be in 'current/total' format"),
      path: ['installment'],
    });
  }
});

type FormData = z.infer<typeof formSchema>;

const EditableTransactionRow: React.FC<EditableTransactionRowProps> = ({
  transaction,
  onSave,
  onCancel,
  isNew = false,
  showActions,
  isSaving,
  currentAccountId,
}) => {
  const { t } = useTranslation();
  const te = (message?: string) => (message ? t(message) : undefined);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const startedUncategorized = useRef(false);
  const routeContext = useRouteContext();
  const { currency } = useFinance();

  // Synchronous so it's available during the first render (ref is set later in a useEffect)
  const isUncategorizedEdit = !isNew && (!transaction?.splits?.[0]?.category_id || transaction?.category_name === 'Uncategorized');

  const defaultValues = useMemo(() => ({
    id: transaction?.id,
    accountId: transaction?.account_id?.toString() || (isNew && currentAccountId ? currentAccountId.toString() : ''),
    paymentDate: transaction?.payment_date || getTodayISO(),
    payee: transaction?.payee || '',
    amount: transaction?.amount || '',
    categoryId: transaction?.splits?.[0]?.category_id?.toString() || '',
    notes: transaction?.notes || '',
    toAccountId: transaction?.to_account_id?.toString() || '',
    type: transaction?.type || 'transaction',
    installment: transaction?.installment_number ? `${transaction.installment_number}/${transaction.installment_total}` : '',
    splitId: transaction?.split_id,
  }), [transaction, isNew, currentAccountId]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: 'onSubmit', // Only validate on submit, not on change/blur during navigation
    reValidateMode: 'onSubmit', // Only re-validate on submit
  });
  
  // Check if this is a Starting Balance transaction
  const isStartingBalance = transaction?.splits?.[0]?.category_id === -3;

  // Split transaction state
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splits, setSplits] = useState<Array<{ id: string; categoryId: string; amount: string; notes: string }>>([]);
  const [splitErrors, setSplitErrors] = useState<Record<string, { categoryId?: string; amount?: string }>>({});
  // Tracks whether the user manually activated split mode so background refetches don't reset in-progress splits
  const userActivatedSplitRef = useRef(false);
  // Tracks the last transaction id the reset effect ran for, so background refetches
  // (which hand us a new transaction object with the same id) don't re-run the destructive reset
  const lastResetTxIdRef = useRef<number | null | undefined>(undefined);
  const hasResetRunRef = useRef(false);

  // State for tracking locked fields
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());
  
  // State for tracking reconciliation restrictions
  const [restrictions, setRestrictions] = useState<SingleEditRestrictions | null>(null);
  const [reconciliationRemoved, setReconciliationRemoved] = useState(false);
  const [showReconciliationDialog, setShowReconciliationDialog] = useState(false);
  
  const { toast } = useToast();

  const { handleSubmit, watch, setValue, formState: { errors } } = form;

  // Temporary flag to disable all custom keyboard navigation (Tab/Enter flow) — set to true to test native browser behavior
  const DISABLE_KEYBOARD_NAV = false;

  // Define field order for keyboard navigation
  const fieldOrder = ['paymentDate', 'payee', 'categoryId', 'notes', 'accountId', 'amount', 'installment'];
  
  // Keyboard navigation configuration
  const keyboardNavigation = useKeyboardNavigation({
    fields: fieldOrder,
    onAdvance: (from, to) => {
      // This will be called when advancing between fields
    },
    onSubmit: () => {
      handleSubmit(onSubmit)();
    },
    onFieldFocus: (field) => {
      // Called when a field receives focus
    }
  });

  // For mode 2b (existing uncategorized): jump straight to the category field on open
  useEffect(() => {
    if (isUncategorizedEdit) {
      keyboardNavigation.focusField('categoryId');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only

  const validateSplits = (): boolean => {
    const txAmount = parseFloat(watch("amount") || "0");
    const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);
    const difference = Math.round((txAmount - splitTotal) * 100) / 100;
    const isBalanced = Math.abs(difference) < 0.01;

    const errors: Record<string, { categoryId?: string; amount?: string }> = {};
    splits.forEach(s => {
      const e: { categoryId?: string; amount?: string } = {};
      if (!s.categoryId) e.categoryId = tKey('Required');
      if (!s.amount || parseFloat(s.amount) === 0) e.amount = tKey('Required');
      if (Object.keys(e).length) errors[s.id] = e;
    });
    setSplitErrors(errors);
    return isBalanced && Object.keys(errors).length === 0;
  };

  const onSubmit = (data: FormData) => {
    // Manual categoryId validation when not in split mode
    if (!isSplitMode && !DISABLE_KEYBOARD_NAV && (!data.categoryId || data.categoryId.trim() === '')) {
      form.setError('categoryId', { message: tKey('Required') });
      return;
    }

    if (isSplitMode && !validateSplits()) return;

    const { installment, ...rest } = data;
    const isInstallment = !!installment;
    const [installment_number, installment_total] = isInstallment ? installment.split('/').map(Number) : [null, null];

    if (isSplitMode) {
      onSave({
        id: rest.id,
        accountId: rest.accountId ? parseInt(rest.accountId) : null,
        paymentDate: rest.paymentDate,
        payee: rest.payee,
        amount: rest.amount,
        toAccountId: rest.toAccountId ? parseInt(rest.toAccountId) : null,
        type: rest.type,
        isInstallment,
        installmentNumber: installment_number,
        installmentTotal: installment_total,
        removeFromReconciliation: reconciliationRemoved,
        isSplitTransaction: true,
        splits: splits.map(s => ({
          categoryId: parseInt(s.categoryId),
          amount: parseFloat(s.amount),
          notes: s.notes,
        })),
      });
    } else {
      onSave({
        id: rest.id,
        accountId: rest.accountId ? parseInt(rest.accountId) : null,
        paymentDate: rest.paymentDate,
        payee: rest.payee,
        amount: rest.amount,
        categoryId: rest.categoryId ? parseInt(rest.categoryId) : null,
        notes: rest.notes,
        toAccountId: rest.toAccountId ? parseInt(rest.toAccountId) : null,
        type: rest.type,
        isInstallment,
        installmentNumber: installment_number,
        installmentTotal: installment_total,
        splitId: data.splitId,
        removeFromReconciliation: reconciliationRemoved,
      });
    }
  };

  const handleEnterSplitMode = () => {
    const currentCategoryId = watch("categoryId") || "";
    const currentNotes = watch("notes") || "";
    userActivatedSplitRef.current = true;
    setIsSplitMode(true);
    setSplits([
      { id: `split-${Date.now()}-1`, categoryId: currentCategoryId, amount: "", notes: currentNotes },
      { id: `split-${Date.now()}-2`, categoryId: "", amount: "", notes: "" },
    ]);
    form.clearErrors('categoryId');
  };

  const handleAddSplit = () => {
    setSplits(prev => [...prev, { id: `split-${Date.now()}`, categoryId: "", amount: "", notes: "" }]);
  };

  const handleRemoveSplit = (splitId: string) => {
    setSplits(prev => prev.filter(s => s.id !== splitId));
    setSplitErrors(prev => { const n = { ...prev }; delete n[splitId]; return n; });
  };

  const handleSplitChange = (splitId: string, updated: any) => {
    setSplits(prev => prev.map(s => s.id === splitId ? updated : s));
    setSplitErrors(prev => ({ ...prev, [splitId]: {} }));
  };

  const splitBalance = (() => {
    const txAmount = parseFloat(watch("amount") || "0");
    const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);
    return Math.round((txAmount - splitTotal) * 100) / 100;
  });

  const handleToAccountIdChange = (id: number) => {
    setValue("toAccountId", id.toString());
  };

  const handleCategoryChange = (categoryId: number) => {
    setValue("categoryId", categoryId.toString());
  };

  const handleTypeChange = (type: string) => {
    setValue("type", type);
  };

  const handleFieldLock = (field: string, locked: boolean) => {
    setLockedFields(prev => {
      const newSet = new Set(prev);
      if (locked) {
        newSet.add(field);
      } else {
        newSet.delete(field);
      }
      return newSet;
    });
  };
  
  const handleUnlockFieldsClick = () => {
    if (!restrictions?.canRemoveFromReconciliation) return;
    setShowReconciliationDialog(true);
  };

  const handleReconciliationDialogProceed = async () => {
    if (!transaction?.id) return;
    
    try {
      // Actually remove the transaction from all reconciliations
      await supabaseService.rpc('remove_transaction_from_all_reconciliations', {
        p_transaction_id: transaction.id
      });
      
      setReconciliationRemoved(true);
      setShowReconciliationDialog(false);
      toast({
        title: t('Transaction removed from reconciliation'),
        description: t('All fields are now editable.'),
        variant: "default"
      });
    } catch (error: any) {
      console.error('Failed to remove transaction from reconciliation:', error);
      toast({
        title: t('Error'),
        description: error.message || t('Failed to remove transaction from reconciliation.'),
        variant: "destructive"
      });
    }
  };

  const handleReconciliationDialogClose = () => {
    setShowReconciliationDialog(false);
  };
  
  // Helper to determine if a field should be disabled
  const isFieldDisabled = (fieldName: string): boolean => {
    // If reconciliation was removed, only check other restrictions (like transfers)
    if (reconciliationRemoved) {
      // Check if this field has non-reconciliation restrictions
      const hasNonReconciledRestriction = restrictions?.restrictionReasons.get(fieldName)?.includes('transfer') || false;
      return hasNonReconciledRestriction || lockedFields.has(fieldName.replace('Id', ''));
    }
    
    // Normal restriction logic
    return restrictions?.disabledFields.has(fieldName) || lockedFields.has(fieldName.replace('Id', ''));
  };
  
  // Helper to get restriction reason for tooltip
  const getRestrictionReason = (fieldName: string): string | undefined => {
    if (reconciliationRemoved) {
      const reason = restrictions?.restrictionReasons.get(fieldName);
      return reason?.includes('transfer') ? reason : undefined;
    }
    return restrictions?.restrictionReasons.get(fieldName);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Handle Escape at the row level
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel(form.getValues());
      return;
    }
    
    // For other keys, let the individual components handle them via keyboard navigation
  };

  // Determine account type filter based on transaction type (memoized to prevent re-renders)
  const accountTypeFilter = useMemo((): 'checking' | 'credit_card' | undefined => {
    const transactionType = watch("type");
    const hasToAccountId = watch("toAccountId");
    
    // If this is a transfer or payment (has toAccountId), filter source account to checking only
    if (hasToAccountId && (transactionType === 'transfer' || transactionType === 'payment')) {
      return 'checking';
    }
    
    return undefined;
  }, [watch("type"), watch("toAccountId")]);

  useEffect(() => {
    const txId = transaction?.id;
    const isSameTx = hasResetRunRef.current && txId === lastResetTxIdRef.current;
    hasResetRunRef.current = true;
    lastResetTxIdRef.current = txId;

    // Same transaction, just a new object reference from a background refetch — skip the
    // destructive reset so in-progress edits (form fields + splits) are preserved
    if (isSameTx) {
      return;
    }

    // Preserve any fields the user is actively editing so a background refetch
    // doesn't clobber in-progress input (e.g. notes typed after a quick category save)
    const dirtyFields = form.formState.dirtyFields;
    const preserved: Partial<FormData> = {};
    (Object.keys(dirtyFields) as Array<keyof FormData>).forEach((key) => {
      if (dirtyFields[key]) preserved[key] = form.getValues(key as any);
    });

    form.reset(defaultValues);

    if (Object.keys(preserved).length > 0) {
      Object.entries(preserved).forEach(([key, val]) => {
        setValue(key as any, val, { shouldDirty: true });
      });
    }

    // Initialize split mode for existing split transactions
    if (transaction?.splits && transaction.splits.length >= 2) {
      userActivatedSplitRef.current = false;
      setIsSplitMode(true);
      setSplits(transaction.splits.map((s: any, i: number) => ({
        id: `split-${transaction.id}-${i}`,
        categoryId: (s.category_id ?? s.categoryId)?.toString() || "",
        amount: s.amount?.toString() || "",
        notes: s.split_observation || s.notes || "",
      })));
    } else if (!userActivatedSplitRef.current) {
      // Only reset if the user hasn't manually entered split mode — a background
      // refetch would otherwise wipe in-progress unsaved splits
      setIsSplitMode(false);
      setSplits([]);
      setSplitErrors({});
    }

    // Track whether this existing transaction opened with Uncategorized category
    startedUncategorized.current = isUncategorizedEdit;

    // Analyze restrictions when transaction changes
    if (transaction && !isNew) {
      const transactionRestrictions = SingleEditValidator.analyzeTransaction(transaction);
      setRestrictions(transactionRestrictions);
      setReconciliationRemoved(false);
    } else {
      setRestrictions(null);
      setReconciliationRemoved(false);
    }
  }, [transaction, form, defaultValues, isNew]);

  return (
    <>
      <tr ref={rowRef} onKeyDown={handleKeyDown} className={cn("bg-blue-100 dark:bg-blue-900")}>
        <td className="py-1 px-2 text-sm h-[25px]">
          {/*<Checkbox checked={false} disabled />*/}
        </td>
        <td className="py-1 px-2 text-sm h-[25px] w-[15px]" /> {/* tag indicator column spacer */}
        <td className="py-1 px-2 text-sm h-[25px]">
          <HybridDateInput
            value={watch("paymentDate")}
            onChange={(val) => setValue("paymentDate", val)}
            error={te(errors.paymentDate?.message)}
            autoFocus={isNew}
            disabled={isFieldDisabled('paymentDate')}
            title={getRestrictionReason('paymentDate')}
            onKeyDown={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : (e) => keyboardNavigation.handleKeyDown(e, 'paymentDate')}
            onAdvance={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : () => keyboardNavigation.advanceToNext('paymentDate')}
            registerFieldRef={keyboardNavigation.registerFieldRef}
            fieldName="paymentDate"
          />
        </td>
        <td className="py-1 px-2 text-sm h-[25px]">
          <PayeeInput
            value={watch("payee")}
            onChange={(val) => setValue("payee", val)}
            error={te(errors.payee?.message)}
            onToAccountIdChange={handleToAccountIdChange}
            onCategoryChange={handleCategoryChange}
            onTypeChange={handleTypeChange}
            currentAccountId={Number(watch("accountId"))}
            onFieldLock={handleFieldLock}
            disabled={isStartingBalance || isFieldDisabled('payee')}
            title={getRestrictionReason('payee')}
            autoOpen={!isSplitMode && !DISABLE_KEYBOARD_NAV && keyboardNavigation.currentField === 'payee'}
            onKeyDown={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : (e) => keyboardNavigation.handleKeyDown(e, 'payee')}
            onAdvance={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : () => keyboardNavigation.advanceToNext('payee')}
            registerFieldRef={keyboardNavigation.registerFieldRef}
            fieldName="payee"
          />
        </td>
        <td className="py-1 px-2 text-sm h-[25px]">
          {isSplitMode ? (
            <div className="h-7 px-2 flex items-center w-full rounded-md border border-input bg-background/50 text-sm text-muted-foreground">
              {t('Multiple categories')}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <CategorySelect
                value={watch("categoryId") || ''}
                onChange={(val) => setValue("categoryId", val)}
                error={te(errors.categoryId?.message)}
                disabled={lockedFields.has('category') || isStartingBalance || isFieldDisabled('categoryId')}
                title={getRestrictionReason('categoryId')}
                openOnFocus={!DISABLE_KEYBOARD_NAV && keyboardNavigation.currentField === 'categoryId'}
                onKeyDown={DISABLE_KEYBOARD_NAV ? undefined : (e) => keyboardNavigation.handleKeyDown(e, 'categoryId')}
                onSelectionComplete={DISABLE_KEYBOARD_NAV ? undefined : (trigger) => {
                  if (startedUncategorized.current && trigger !== 'tab') {
                    handleSubmit(onSubmit)();
                  } else {
                    keyboardNavigation.advanceToNext('categoryId');
                  }
                }}
                registerFieldRef={keyboardNavigation.registerFieldRef}
                fieldName="categoryId"
              />
              {!isStartingBalance && !lockedFields.has('category') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
                  onClick={handleEnterSplitMode}
                  title={t('Split across multiple categories')}
                >
                  <Plus className="h-3 w-3 mr-0.5" />
                  {t('Split')}
                </Button>
              )}
            </div>
          )}
        </td>
        <td className="py-1 px-2 text-sm h-[25px]">
          {isSplitMode ? (
            <div className="h-7 px-2 flex items-center w-full rounded-md border border-input bg-background/50 text-sm text-muted-foreground italic">
              {t('Per split')}
            </div>
          ) : (
            <NotesInput
              value={watch("notes") || ''}
              onChange={(val) => setValue("notes", val)}
              error={te(errors.notes?.message)}
              onKeyDown={(e) => keyboardNavigation.handleKeyDown(e, 'notes')}
              registerFieldRef={keyboardNavigation.registerFieldRef}
              fieldName="notes"
            />
          )}
        </td>
        <td className="py-1 px-2 text-sm h-[25px]">
          <AccountSelect
            value={watch("accountId")}
            onChange={(val) => setValue("accountId", val)}
            error={te(errors.accountId?.message)}
            disabled={isStartingBalance || isFieldDisabled('accountId')}
            title={getRestrictionReason('accountId')}
            excludeAccountId={watch("toAccountId") ? parseInt(watch("toAccountId") ?? '') : undefined}
            filterToAccountType={accountTypeFilter}
            autoOpen={!isSplitMode && !DISABLE_KEYBOARD_NAV && keyboardNavigation.currentField === 'accountId' && routeContext.isMainTransactions}
            onKeyDown={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : (e) => keyboardNavigation.handleKeyDown(e, 'accountId')}
            onSelectionComplete={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : () => keyboardNavigation.advanceToNext('accountId')}
            registerFieldRef={keyboardNavigation.registerFieldRef}
            fieldName="accountId"
          />
        </td>
        <td className="py-1 px-2 text-sm h-[25px]">
          <AmountInput
            value={watch("amount")}
            onChange={(val) => setValue("amount", val)}
            error={te(errors.amount?.message)}
            disabled={isFieldDisabled('amount')}
            title={getRestrictionReason('amount')}
            onKeyDown={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : (e) => keyboardNavigation.handleKeyDown(e, 'amount')}
            registerFieldRef={keyboardNavigation.registerFieldRef}
            fieldName="amount"
          />
        </td>
        <td className="py-1 px-2 text-sm h-[25px]">
          <InstallmentInput
            value={watch("installment") ?? ''}
            onChange={(val) => setValue("installment", val)}
            onBlur={() => {}}
            error={te(errors.installment?.message)}
            onKeyDown={isSplitMode || DISABLE_KEYBOARD_NAV ? undefined : (e) => keyboardNavigation.handleKeyDown(e, 'installment')}
            registerFieldRef={keyboardNavigation.registerFieldRef}
            fieldName="installment"
          />
        </td>
        {showActions && <td className="py-1 px-2 text-sm h-[25px] bg-blue-100 dark:bg-blue-900" />}
        {/* EyeOff / ignore column spacer */}
        <td className="hidden md:table-cell py-1 px-2 text-sm h-[25px] bg-blue-100 dark:bg-blue-900" />
        <td className="w-[20px]" />
      </tr>

      {/* Split rows (edit mode) */}
      {isSplitMode && splits.map((split) => (
        <EditableSplitRow
          key={split.id}
          split={split}
          onSplitChange={(updated) => handleSplitChange(split.id, updated)}
          onRemove={() => handleRemoveSplit(split.id)}
          canRemove={splits.length > 2}
          error={splitErrors[split.id] && { categoryId: te(splitErrors[split.id].categoryId), amount: te(splitErrors[split.id].amount) }}
        />
      ))}

      {/* Footer row — Add split + balance indicator + Save/Cancel */}
      <tr className={cn("bg-blue-100 dark:bg-blue-900")}>
        <td className="py-1 px-2" />
        <td className="py-1 px-2" />
        <td className="py-1 px-2" />
        {/* Add split button in category column */}
        <td className="py-1 px-2">
          {isSplitMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleAddSplit}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('Add split')}
            </Button>
          )}
        </td>
        <td className="py-1 px-2" />
        <td className="py-1 px-2" />
        {/* Balance indicator in amount column */}
        <td className="py-1 px-2 text-right">
          {isSplitMode && (() => {
            const diff = splitBalance();
            const isBalanced = Math.abs(diff) < 0.01;
            // Expenses are negative, so "left" means the remainder shares the transaction's sign.
            const isOver = diff * (parseFloat(watch("amount") || "0") < 0 ? -1 : 1) < 0;
            return (
              <span className={cn("text-xs font-medium", isBalanced ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                {isBalanced
                  ? t('✓ Balanced')
                  : isOver
                    ? t('{{amount}} over', { amount: formatCurrency(Math.abs(diff), currency) })
                    : t('{{amount}} left', { amount: formatCurrency(Math.abs(diff), currency) })}
              </span>
            );
          })()}
        </td>
        <td className="py-1 px-2" />
        {showActions && <td className="py-1 px-2" />}
        {/* EyeOff column spacer — keep footer blue all the way across */}
        <td className="hidden md:table-cell py-1 px-2" />
        <td className="py-1 px-2">
          <div className="flex justify-end space-x-2">
            {restrictions?.canRemoveFromReconciliation && !reconciliationRemoved && (
              <Button
                className="h-7 px-2 bg-orange-500 text-white hover:bg-orange-600 hover:text-white"
                variant="outline"
                size="sm"
                onClick={handleUnlockFieldsClick}
                disabled={isSaving}
                title={t('Remove this transaction from reconciliation to edit protected fields')}
              >
                {t('Unlock All Fields')}
              </Button>
            )}
            <Button className="h-7 px-2" variant="outline" size="sm" onClick={() => onCancel(form.getValues())} disabled={isSaving}>
              {t('Cancel')}
            </Button>
            <Button
              className="h-7 px-2 bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
              variant="outline"
              size="sm"
              onClick={handleSubmit(onSubmit)}
              disabled={isSaving}
            >
              {isSaving ? <Spinner size="sm" /> : t('Save')}
            </Button>
          </div>
        </td>
        {/* Buffer column for scrollbar clearance */}
        <td className="w-[20px]" />
      </tr>

      {/* Reconciliation Warning Dialog */}
      <ReconciliationWarningDialog
        isOpen={showReconciliationDialog}
        onClose={handleReconciliationDialogClose}
        onProceed={handleReconciliationDialogProceed}
        transactionId={transaction?.id || 0}
        warningType="edit"
      />
    </>
  );
};

export default EditableTransactionRow;

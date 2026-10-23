import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { useFinance } from '@/contexts/finance-context';
import { formatDateForDisplay } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import CategorySelect from './inline-form-fields/category-select';

export interface FieldRestriction {
  disabled?: boolean;
  reason?: string;
}

interface TransactionEditFieldsProps {
  // 'batch' adds the "No change" options; 'single' edits one real value per field.
  mode: 'single' | 'batch';
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  dateRestriction?: FieldRestriction;
  dateError?: string;
  // Status and Ignore Flag don't apply to new transactions.
  showStatusAndIgnore?: boolean;
  statusId: string;
  onStatusChange: (value: string) => void;
  isIgnored: string;
  onIsIgnoredChange: (value: string) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  categoryRestriction?: FieldRestriction;
  categoryError?: string;
  onCategorySelectionComplete?: () => void;
  accountId: string;
  onAccountChange: (value: string) => void;
  accountRestriction?: FieldRestriction;
  accountError?: string;
  notes: string;
  onNotesChange: (value: string) => void;
  // Single-only fields (Payee, Amount) rendered right below Date/Status.
  afterDateStatus?: React.ReactNode;
  // Single-only fields (Tag) rendered below Notes.
  afterNotes?: React.ReactNode;
}

const TransactionEditFields: React.FC<TransactionEditFieldsProps> = ({
  mode,
  date,
  onDateChange,
  dateRestriction,
  dateError,
  showStatusAndIgnore = true,
  statusId,
  onStatusChange,
  isIgnored,
  onIsIgnoredChange,
  categoryId,
  onCategoryChange,
  categoryRestriction,
  categoryError,
  onCategorySelectionComplete,
  accountId,
  onAccountChange,
  accountRestriction,
  accountError,
  notes,
  onNotesChange,
  afterDateStatus,
  afterNotes,
}) => {
  const { t } = useTranslation();
  const { accounts, locale, dateFormat } = useFinance();
  const isBatch = mode === 'batch';

  const selectableAccounts = (accounts ?? [])
    .filter(account => isBatch || account.is_active || account.id.toString() === accountId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4 py-4">
      <div className={cn("grid grid-cols-1 gap-4", showStatusAndIgnore && "sm:grid-cols-2")}>
        <div className="space-y-2">
          <Label htmlFor="date">{t('Date')}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  dateRestriction?.disabled && "opacity-50 cursor-not-allowed",
                  dateError && "border-red-500"
                )}
                disabled={dateRestriction?.disabled}
                title={dateRestriction?.reason}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? (
                  formatDateForDisplay(date, locale, dateFormat)
                ) : (
                  <span className="text-muted-foreground">{t('Pick a date')}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date || undefined}
                onSelect={(selected) => onDateChange(selected || null)}
                initialFocus
                disabled={dateRestriction?.disabled}
              />
            </PopoverContent>
          </Popover>
          {dateError && <p className="text-xs text-red-500">{dateError}</p>}
        </div>
        {showStatusAndIgnore && (
          <div className="space-y-2">
            <Label htmlFor="status">{t('Status')}</Label>
            <Select value={statusId} onValueChange={onStatusChange}>
              <SelectTrigger>
                <SelectValue placeholder={t('Select status...')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('Pending')}</SelectItem>
                <SelectItem value="2">{t('Cleared')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {afterDateStatus}

      {showStatusAndIgnore && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('Ignore Flag')}</Label>
          <RadioGroup
            value={isIgnored}
            onValueChange={onIsIgnoredChange}
            className="flex flex-wrap gap-x-6 gap-y-2"
          >
            {isBatch && (
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no-change" id="ignore-no-change" />
                <Label htmlFor="ignore-no-change" className="text-sm">{t('No change')}</Label>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id="ignore-true" />
              <Label htmlFor="ignore-true" className="text-sm">{t('Ignore')}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id="ignore-false" />
              <Label htmlFor="ignore-false" className="text-sm">{t('Show')}</Label>
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="category">{t('Category')}</Label>
        <CategorySelect
          value={categoryId}
          onChange={onCategoryChange}
          disabled={categoryRestriction?.disabled}
          title={categoryRestriction?.reason}
          error={categoryError}
          size="default"
          showNoChangeOption={isBatch}
          onSelectionComplete={onCategorySelectionComplete}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account">{t('Account')}</Label>
        <Select
          value={accountId}
          onValueChange={onAccountChange}
          disabled={accountRestriction?.disabled}
        >
          <SelectTrigger
            className={cn(
              accountRestriction?.disabled && "opacity-50 cursor-not-allowed",
              accountError && "border-red-500"
            )}
            title={accountRestriction?.reason}
          >
            <SelectValue placeholder={t('Select account...')} />
          </SelectTrigger>
          <SelectContent>
            {isBatch && <SelectItem value="no-change">{t('No account change')}</SelectItem>}
            {selectableAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id.toString()}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {accountError && <p className="text-xs text-red-500">{accountError}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t('Notes')}</Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={t('Add notes...')}
          rows={3}
        />
      </div>

      {afterNotes}
    </div>
  );
};

export default TransactionEditFields;

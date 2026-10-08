import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFinance } from '@/contexts/finance-context';
import { isCreditCard } from '@/utils/transfer-utils';

interface AccountSelectProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  title?: string;
  excludeAccountId?: number; // Account ID to exclude from the list (for preventing circular transfers)
  filterToAccountType?: 'checking' | 'credit_card'; // Filter accounts to specific type (for transfer/payment rules)
  autoOpen?: boolean; // Auto-open on focus (for keyboard navigation)
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  onSelectionComplete?: () => void; // Called after account is selected
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
}

const AccountSelect: React.FC<AccountSelectProps> = ({
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  title,
  excludeAccountId,
  filterToAccountType,
  autoOpen = false,
  onKeyDown,
  onSelectionComplete,
  registerFieldRef,
  fieldName,
}) => {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { accounts } = useFinance();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Controls which item cmdk highlights. Initialized to the current account on open
  // so the list doesn't highlight the first item alphabetically (which Tab would commit).
  const [commandValue, setCommandValue] = useState('');
  // Tracks whether the user actually navigated the list (arrow keys/typing) during this
  // open cycle. cmdk auto-highlights the first item on mount as a race against our own
  // "highlight current account" effect, so Tab must not trust cmdk's highlighted item
  // unless the user actually moved it.
  const userNavigatedRef = useRef(false);

  // Filter accounts based on various criteria (memoized to prevent blinking)
  const availableAccounts = useMemo(() => {
    return accounts.filter(account => {
      // Must be active
      if (!account.is_active) return false;
      
      // Exclude specific account (to prevent circular transfers)
      if (excludeAccountId && account.id === excludeAccountId) return false;
      
      // Filter by account type for transfer/payment rules
      if (filterToAccountType) {
        const isAccountCreditCard = isCreditCard(account);
        if (filterToAccountType === 'checking' && isAccountCreditCard) return false;
        if (filterToAccountType === 'credit_card' && !isAccountCreditCard) return false;
      }
      
      return true;
    });
  }, [accounts, excludeAccountId, filterToAccountType]);

  // Auto-open when autoOpen is true
  useEffect(() => {
    if (autoOpen && !disabled) {
      setPopoverOpen(true);
    }
  }, [autoOpen, disabled]);

  // Highlight the currently-selected account whenever the dropdown opens (covers
  // user click, Enter, and auto-open — all of which set popoverOpen)
  useEffect(() => {
    if (popoverOpen) {
      const current = availableAccounts.find((a) => a.id.toString() === value)?.name ?? '';
      setCommandValue(current);
      userNavigatedRef.current = false;
    }
  }, [popoverOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register field reference
  useEffect(() => {
    if (registerFieldRef && fieldName && buttonRef.current) {
      registerFieldRef(fieldName, buttonRef.current);
    }
    return () => {
      if (registerFieldRef && fieldName) {
        registerFieldRef(fieldName, null);
      }
    };
  }, [registerFieldRef, fieldName]);

  return (
    <div className="space-y-1">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={buttonRef}
            variant="outline"
            role="combobox"
            id="account-combobox"
            className={cn(
              "w-full justify-between h-7 p-2",
              !value && "text-muted-foreground",
              error ? "border-red-500" : "",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onBlur={onBlur}
            title={title}
            onKeyDown={(e) => {
              // Handle keyboard navigation first
              if (onKeyDown) {
                const handled = onKeyDown(e);
                if (handled) return;
              }
              
              // Handle Enter to open dropdown
              if (e.key === 'Enter' && !popoverOpen) {
                e.preventDefault();
                setPopoverOpen(true);
              }
            }}
            disabled={disabled}
          >
            {value
              ? availableAccounts.find((account) => account.id.toString() === value)?.name
              : t('Select account')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command value={commandValue} onValueChange={setCommandValue}>
            <CommandInput
              placeholder={t('Search account...')}
              onValueChange={() => {
                // Typing a search query counts as navigation/intent to change the value.
                userNavigatedRef.current = true;
              }}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && popoverOpen) {
                  userNavigatedRef.current = true;
                  return;
                }
                if (e.key === 'Tab' && popoverOpen) {
                  e.preventDefault();
                  if (e.shiftKey) {
                    // Shift+Tab: go back without committing
                    setPopoverOpen(false);
                    onKeyDown?.(e);
                    return;
                  }
                  // If the user never navigated the list, tabbing through must not touch
                  // the value at all — cmdk may highlight the first item on mount as a race
                  // against our own "highlight current account" effect, and that highlight
                  // is not a real user selection.
                  if (!userNavigatedRef.current) {
                    setPopoverOpen(false);
                    onSelectionComplete?.();
                    return;
                  }
                  // Tab after real navigation: commit the highlighted account and advance.
                  const list = e.currentTarget.closest('[cmdk-root]');
                  const highlighted = list?.querySelector('[cmdk-item][data-selected="true"]') as HTMLElement | null;
                  if (highlighted) {
                    highlighted.click();
                  } else {
                    setPopoverOpen(false);
                    onSelectionComplete?.();
                  }
                }
              }}
            />
            <CommandList>
              {availableAccounts.sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                <CommandItem
                  key={account.id}
                  value={account.name}
                  onSelect={() => {
                    onChange(account.id.toString());
                    setPopoverOpen(false);
                    // Advance to next field after selection
                    if (onSelectionComplete) {
                      onSelectionComplete();
                    }
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === account.id.toString() ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {account.name}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};

export default AccountSelect;

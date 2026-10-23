import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFinance } from '@/contexts/finance-context';
import { supabaseService } from '@/services/supabase-service';
import { generatePaymentPayeeName, isCreditCard } from '@/utils/transfer-utils';

interface PayeeInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  onToAccountIdChange: (accountId: number) => void;
  onCategoryChange?: (categoryId: number) => void;
  onTypeChange?: (type: string) => void;
  currentAccountId?: number; // Account where the transaction is being recorded
  onFieldLock?: (field: string, locked: boolean) => void; // For locking category and type fields
  disabled?: boolean;
  title?: string;
  size?: 'sm' | 'default';
  autoOpen?: boolean;
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  onAdvance?: () => void;
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
}

type PanelMode = 'main' | 'transfer' | 'payment';

const PayeeInput: React.FC<PayeeInputProps> = ({
  value,
  onChange,
  onBlur,
  error,
  onToAccountIdChange,
  onCategoryChange,
  onTypeChange,
  currentAccountId,
  onFieldLock,
  disabled = false,
  title,
  size = 'sm',
  autoOpen = false,
  onKeyDown,
  onAdvance,
  registerFieldRef,
  fieldName,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(value);
  const [debouncedInput, setDebouncedInput] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>('main');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const mouseDownOnDropdown = useRef(false);
  const selectionMadeRef = useRef(false);
  const { accounts } = useFinance();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(inputValue), 250);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: payeeResults = [], isFetching } = useQuery({
    queryKey: ['payees', debouncedInput],
    queryFn: () => supabaseService.getPayees(debouncedInput),
    enabled: debouncedInput.length > 0,
    staleTime: 60_000,
  });

  const activeAccounts = accounts.filter(a => a.is_active);
  const currentAccount = activeAccounts.find(a => a.id === currentAccountId);
  const isCurrentAccountCreditCard = currentAccount ? isCreditCard(currentAccount) : false;

  // Create transfer and payment options based on account type rules
  const transferAndPaymentOptions = useMemo(() => {
    const options: Array<{
      value: string;
      label: string;
      isPayment?: boolean;
      isTransfer?: boolean;
      accountId: number;
      direction: 'to' | 'from';
      requiresAccountType?: 'checking' | 'credit_card';
    }> = [];

    // If no current account is selected, show all possible options but mark what account type they require
    if (!currentAccountId) {
      // Show all possible transfers between checking accounts
      const checkingAccounts = activeAccounts.filter(account => !isCreditCard(account));
      checkingAccounts.forEach(account => {
        options.push({
          value: `transfer_to_${account.id}`,
          label: `Transfer to ${account.name}`,
          isTransfer: true,
          accountId: account.id,
          direction: 'to',
          requiresAccountType: 'checking'
        });
      });

      // Show all possible payments to credit cards
      const creditCardAccounts = activeAccounts.filter(account => isCreditCard(account));
      creditCardAccounts.forEach(account => {
        options.push({
          value: `payment_to_${account.id}`,
          label: generatePaymentPayeeName(account, 'to'),
          isPayment: true,
          accountId: account.id,
          direction: 'to',
          requiresAccountType: 'checking'
        });
      });

      return options;
    }

    // When current account is selected, apply proper rules
    if (isCurrentAccountCreditCard) {
      // CREDIT CARDS can only receive payments FROM checking accounts
      const checkingAccounts = activeAccounts.filter(
        account => account.id !== currentAccountId && !isCreditCard(account)
      );

      checkingAccounts.forEach(account => {
        options.push({
          value: `payment_from_${account.id}`,
          label: generatePaymentPayeeName(account, 'from'),
          isPayment: true,
          accountId: account.id,
          direction: 'from'
        });
      });
    } else {
      // CHECKING ACCOUNTS can:
      // 1. Make payments TO credit card accounts
      const creditCardAccounts = activeAccounts.filter(
        account => account.id !== currentAccountId && isCreditCard(account)
      );

      creditCardAccounts.forEach(account => {
        options.push({
          value: `payment_to_${account.id}`,
          label: generatePaymentPayeeName(account, 'to'),
          isPayment: true,
          accountId: account.id,
          direction: 'to'
        });
      });

      // 2. Make/receive transfers TO/FROM other checking accounts
      const otherCheckingAccounts = activeAccounts.filter(
        account => account.id !== currentAccountId && !isCreditCard(account)
      );

      otherCheckingAccounts.forEach(account => {
        options.push({
          value: `transfer_to_${account.id}`,
          label: `Transfer to ${account.name}`,
          isTransfer: true,
          accountId: account.id,
          direction: 'to'
        });
      });
    }

    return options;
  }, [activeAccounts, currentAccountId, isCurrentAccountCreditCard]);

  const transferOptions = useMemo(
    () => transferAndPaymentOptions.filter(o => o.isTransfer),
    [transferAndPaymentOptions]
  );
  const paymentOptions = useMemo(
    () => transferAndPaymentOptions.filter(o => o.isPayment),
    [transferAndPaymentOptions]
  );

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Register field reference
  useEffect(() => {
    if (registerFieldRef && fieldName && inputRef.current) {
      registerFieldRef(fieldName, inputRef.current);
    }
    return () => {
      if (registerFieldRef && fieldName) {
        registerFieldRef(fieldName, null);
      }
    };
  }, [registerFieldRef, fieldName]);

  const updateDropdownPos = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  const closeDropdown = useCallback(() => {
    mouseDownOnDropdown.current = false;
    setIsOpen(false);
    setPanelMode('main');
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    updateDropdownPos();
    setIsOpen(true);
  }, [disabled, updateDropdownPos]);

  // Auto-open when autoOpen is true
  useEffect(() => {
    if (autoOpen && !disabled) {
      openDropdown();
    }
  }, [autoOpen, disabled, openDropdown]);

  // Keep dropdown anchored on scroll or resize
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updateDropdownPos, true);
    window.addEventListener('resize', updateDropdownPos);
    return () => {
      window.removeEventListener('scroll', updateDropdownPos, true);
      window.removeEventListener('resize', updateDropdownPos);
    };
  }, [isOpen, updateDropdownPos]);

  const selectPayee = useCallback((name: string, defaultCategoryId?: number | null) => {
    selectionMadeRef.current = true;
    onChange(name);
    setInputValue(name);
    if (onFieldLock) {
      onFieldLock('category', false);
      onFieldLock('type', false);
    }
    if (onCategoryChange) onCategoryChange(defaultCategoryId ?? 0);
    closeDropdown();
    if (onAdvance) onAdvance();
  }, [onChange, onFieldLock, onCategoryChange, onAdvance, closeDropdown]);

  const handleTransferPaymentSelection = useCallback((option: any) => {
    onChange(option.label);
    setInputValue(option.label);
    onToAccountIdChange(option.accountId);
    if (onCategoryChange) onCategoryChange(-4);
    if (onTypeChange) {
      if (option.isTransfer) onTypeChange('transfer');
      else if (option.isPayment) onTypeChange('payment');
    }
    if (onFieldLock) {
      onFieldLock('category', true);
      onFieldLock('type', true);
    }
    closeDropdown();
    if (onAdvance) onAdvance();
  }, [onChange, onToAccountIdChange, onCategoryChange, onTypeChange, onFieldLock, onAdvance, closeDropdown]);

  const handleFocus = () => {
    openDropdown();
  };

  const handleBlur = () => {
    // mousedown on dropdown called e.preventDefault() — blur may still fire in some browsers
    if (mouseDownOnDropdown.current) {
      mouseDownOnDropdown.current = false;
      inputRef.current?.focus();
      return;
    }
    // selectPayee already called onChange with the correct name; don't override with typed text
    if (selectionMadeRef.current) {
      selectionMadeRef.current = false;
      closeDropdown();
      if (onBlur) onBlur();
      return;
    }
    if (inputValue.trim() && inputValue !== value) {
      onChange(inputValue.trim());
    }
    closeDropdown();
    if (onBlur) onBlur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // If user was on a transfer/payment and starts typing, undo the transfer side-effects
    const isCurrentlyTransferPayment = transferAndPaymentOptions.some(opt => opt.label === value);
    if (isCurrentlyTransferPayment && onFieldLock) {
      onFieldLock('category', false);
      onFieldLock('type', false);
      onToAccountIdChange(0);
      if (onCategoryChange) onCategoryChange(0);
      if (onTypeChange) onTypeChange('expense');
      onChange('');
    }

    if (!isOpen) openDropdown();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) {
      const handled = onKeyDown(e);
      if (handled) return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (panelMode !== 'main') {
        setPanelMode('main');
      } else {
        closeDropdown();
      }
      return;
    }

    if (e.key === 'Enter' && isOpen && panelMode === 'main') {
      const trimmed = inputValue.trim();
      if (trimmed) {
        e.preventDefault();
        const match = payeeResults.find(
          p => p.name.toLowerCase() === trimmed.toLowerCase()
        );
        selectPayee(match?.name ?? trimmed, match?.default_category_id);
      }
    }
  };

  const subPanelTitle =
    panelMode === 'transfer'
      ? t('Transfer to')
      : isCurrentAccountCreditCard
      ? t('Payment from')
      : t('Payment to');

  const dropdown = isOpen
    ? createPortal(
        <div
          style={{
            position: 'absolute',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 240),
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
          className="bg-popover text-popover-foreground border border-border rounded-md shadow-md py-1 overflow-hidden"
          onMouseDown={(e) => {
            mouseDownOnDropdown.current = true;
            e.preventDefault(); // keep input focused
          }}
        >
          {panelMode === 'main' ? (
            <>
              {payeeResults.map(payee => (
                <div
                  key={payee.id}
                  className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                  onClick={() => selectPayee(payee.name, payee.default_category_id)}
                >
                  {payee.name}
                </div>
              ))}
              {inputValue.trim() &&
                !isFetching &&
                !payeeResults.some(
                  p => p.name.toLowerCase() === inputValue.trim().toLowerCase()
                ) && (
                  <div
                    className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                    onClick={() => selectPayee(inputValue.trim())}
                  >
                    {t('Create')} &ldquo;{inputValue.trim()}&rdquo;
                  </div>
                )}
              {(transferOptions.length > 0 || paymentOptions.length > 0) && (
                <div className="border-t border-border mt-1 pt-1">
                  {transferOptions.length > 0 && (
                    <div
                      className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                      onClick={() => setPanelMode('transfer')}
                    >
                      <span>{t("Transfer")}</span>
                      <span className="text-muted-foreground text-xs">→</span>
                    </div>
                  )}
                  {paymentOptions.length > 0 && (
                    <div
                      className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                      onClick={() => setPanelMode('payment')}
                    >
                      <span>{t("Payment")}</span>
                      <span className="text-muted-foreground text-xs">→</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className="px-3 py-1.5 text-sm font-medium border-b border-border flex items-center gap-2 cursor-pointer hover:bg-accent mb-1"
                onClick={() => setPanelMode('main')}
              >
                <ArrowLeft className="h-3 w-3" />
                <span>{subPanelTitle}</span>
              </div>
              {(panelMode === 'transfer' ? transferOptions : paymentOptions).map(option => {
                const accountName =
                  activeAccounts.find(a => a.id === option.accountId)?.name ?? option.label;
                return (
                  <div
                    key={option.value}
                    className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                    onClick={() => handleTransferPaymentSelection(option)}
                  >
                    {accountName}
                  </div>
                );
              })}
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={t("Select or enter payee")}
        disabled={disabled}
        title={title}
        className={cn(
          'flex w-full rounded-md border border-input bg-background text-sm',
          size === 'default' ? 'h-10 px-3 py-2' : 'h-7 px-2 py-1',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-red-500' : ''
        )}
      />
      {dropdown}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};

export default PayeeInput;

/** DO NOT REMOVE THE CODE COMMENTED BELOW UNDER ANY CIRCUMSTANCE */
/*
Old Command/Popover-based transferPayees list — kept for reference:

{transferPayees.map((payee) => (
  <CommandItem
    key={payee.value}
    value={payee.value}
    onSelect={() => {
      onChange(payee.value);
      onToAccountIdChange(payee.accountId);
      setPopoverOpen(false);
    }}
  >
    <Check
      className={cn(
        "mr-2 h-4 w-4",
        value === payee.value ? "opacity-100" : "opacity-0"
      )}
    />
    {payee.label}
  </CommandItem>
))}
*/
/** DO NOT REMOVE THE CODE COMMENTED ABOVE UNDER ANY CIRCUMSTANCE */

import React from 'react';
import { LocaleAmountInput } from '@/components/ui/locale-amount-input';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  title?: string;
  size?: 'sm' | 'default';
  onKeyDown?: (event: React.KeyboardEvent) => boolean;
  registerFieldRef?: (fieldName: string, element: HTMLElement | null) => void;
  fieldName?: string;
}

const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChange,
  onBlur,
  error,
  disabled,
  title,
  size = 'sm',
  onKeyDown,
  registerFieldRef,
  fieldName,
}) => {
  return (
    <LocaleAmountInput
      ref={(el) => {
        if (registerFieldRef && fieldName) {
          registerFieldRef(fieldName, el);
        }
      }}
      id="amount"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      disabled={disabled}
      title={title}
      className={size === 'default' ? '!h-10 !px-3 !py-2' : undefined}
      error={error}
      data-testid="currency-input"
    />
  );
};

export default AmountInput;

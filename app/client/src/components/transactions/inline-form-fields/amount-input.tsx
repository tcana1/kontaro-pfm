import React from 'react';
import { LocaleAmountInput } from '@/components/ui/locale-amount-input';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  title?: string;
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
      error={error}
      data-testid="currency-input"
    />
  );
};

export default AmountInput;

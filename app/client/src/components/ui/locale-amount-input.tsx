import React from 'react';
import { NumericFormat, NumberFormatValues, SourceInfo } from 'react-number-format';
import { useFinance } from '@/contexts/finance-context';
import { type CurrencyCode } from '@/lib/currency-formatter';

interface LocaleAmountInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  title?: string;
  'data-testid'?: string;
}

/**
 * Locale-aware amount input component using react-number-format
 * Handles proper number formatting for different locales while maintaining
 * consistent internal data format (dot decimal separator).
 * 
 * Features:
 * - Displays numbers in user's locale format (e.g., "1.234,56" for BR)
 * - Accepts locale-appropriate input patterns
 * - Always outputs normalized values with dot decimal separator
 * - Handles thousands separators and decimal separators correctly
 * - Supports negative numbers
 * - Real-time validation and error feedback
 */

// Locale configuration for different currencies
const getLocaleConfig = (currency: CurrencyCode) => {
  const configs = {
    // US Dollar - 1,234.56
    USD: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
    // Euro - 1.234,56 (German/Italian style) or 1 234,56 (French style)
    // Using the more common German/Italian format
    EUR: {
      thousandSeparator: '.',
      decimalSeparator: ',',
      decimalScale: 2,
    },
    // British Pound - 1,234.56
    GBP: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
    // Brazilian Real - 1.234,56
    BRL: {
      thousandSeparator: '.',
      decimalSeparator: ',',
      decimalScale: 2,
    },
    // Japanese Yen - 1,234 (no decimals)
    JPY: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 0,
    },
    // Chinese Yuan - 1,234.56
    CNY: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
    // Mexican Peso - 1,234.56
    MXN: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
    // Canadian Dollar - 1,234.56
    CAD: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
    // Australian Dollar - 1,234.56
    AUD: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
    // Indian Rupee - 1,23,456.78 (but we'll use standard format for simplicity)
    INR: {
      thousandSeparator: ',',
      decimalSeparator: '.',
      decimalScale: 2,
    },
  };
  
  return configs[currency] || configs.USD;
};

export const LocaleAmountInput = React.forwardRef<HTMLInputElement, LocaleAmountInputProps>(({
  value,
  onChange,
  onBlur,
  onKeyDown,
  error,
  disabled = false,
  placeholder,
  className = "",
  id,
  'data-testid': dataTestId = "locale-amount-input",
}, ref) => {
  const { currency } = useFinance();
  const localeConfig = getLocaleConfig(currency);

  /**
   * Generate locale-aware placeholder
   */
  const getLocalePlaceholder = () => {
    if (placeholder) return placeholder; // Use custom placeholder if provided
    
    // Generate default placeholder based on locale
    if (localeConfig.decimalScale === 0) {
      // For currencies like JPY with no decimals
      return `0`;
    } else {
      // For currencies with decimals, show format like "0,00" for BR or "0.00" for US
      const decimals = '0'.repeat(localeConfig.decimalScale);
      return `0${localeConfig.decimalSeparator}${decimals}`;
    }
  };

  /**
   * Handle value changes from react-number-format
   * Always normalize to dot decimal format for internal consistency
   */
  const handleValueChange = (values: NumberFormatValues, sourceInfo: SourceInfo) => {
    // Use floatValue if available (for valid numbers), otherwise use value
    const normalizedValue = values.floatValue !== undefined 
      ? values.floatValue.toString()
      : values.value || '';
    
    onChange(normalizedValue);
  };

  /**
   * Convert normalized value (dot decimal) to display value for the current locale
   */
  const getDisplayValue = () => {
    if (!value) return '';
    
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return value;
    
    return numericValue.toString();
  };

  const hasError = !!error;

  return (
    <div className="space-y-1">
      <NumericFormat
        getInputRef={ref}
        id={id}
        value={getDisplayValue()}
        onValueChange={handleValueChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={getLocalePlaceholder()}
        thousandSeparator={localeConfig.thousandSeparator}
        decimalSeparator={localeConfig.decimalSeparator}
        decimalScale={localeConfig.decimalScale}
        inputMode="decimal"
        allowNegative={true}
        allowLeadingZeros={false}
        fixedDecimalScale={false}
        className={`flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-right text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${hasError ? "border-red-500" : ""} ${className}`}
        data-testid={dataTestId}
      />
      {hasError && (
        <p className="text-red-500 text-xs">
          {error}
        </p>
      )}
    </div>
  );
});

LocaleAmountInput.displayName = 'LocaleAmountInput';

export default LocaleAmountInput;
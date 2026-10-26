export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'BRL' | 'MXN' | 'CAD' | 'AUD' | 'INR';

export type CurrencyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name' | 'none';

export interface MoneyFormat {
  currency: CurrencyCode;
  // The user's locale drives punctuation (1.234,56 vs 1,234.56). It is deliberately
  // required: deriving it from the currency is what made the locale setting a no-op
  // outside this file for so long.
  locale: string;
  currencyDisplay?: CurrencyDisplay;
  hideCents?: boolean;
  // Wins over hideCents, for places that always show whole units (charts, summaries).
  precision?: number;
}

interface CurrencyConfig {
  symbol: string;
  // Only a suggestion offered when the user picks a currency in Settings.
  locale: string;
  precision: number;
}

const currencyConfigs: Record<CurrencyCode, CurrencyConfig> = {
  USD: { symbol: '$', locale: 'en-US', precision: 2 },
  EUR: { symbol: '€', locale: 'de-DE', precision: 2 },
  GBP: { symbol: '£', locale: 'en-GB', precision: 2 },
  JPY: { symbol: '¥', locale: 'ja-JP', precision: 0 },
  CNY: { symbol: '¥', locale: 'zh-CN', precision: 2 },
  BRL: { symbol: 'R$', locale: 'pt-BR', precision: 2 },
  MXN: { symbol: '$', locale: 'es-MX', precision: 2 },
  CAD: { symbol: '$', locale: 'en-CA', precision: 2 },
  AUD: { symbol: '$', locale: 'en-AU', precision: 2 },
  INR: { symbol: '₹', locale: 'en-IN', precision: 2 },
};

export const getDefaultLocaleForCurrency = (currencyCode: CurrencyCode): string => {
  return (currencyConfigs[currencyCode] || currencyConfigs.USD).locale;
};

export const roundDown = (
  amount: number,
  decimals = 0
) => {
  const factor = 10 ** decimals;
  return amount >= 0
    ? Math.floor(amount * factor) / factor
    : Math.ceil(amount * factor) / factor;
}

export const formatMoney = (amount: number, fmt: MoneyFormat): string => {
  const config = currencyConfigs[fmt.currency] || currencyConfigs.USD;
  const precision = fmt.precision ?? (fmt.hideCents ? 0 : config.precision);
  const display = fmt.currencyDisplay ?? 'symbol';

  // 'none' is not an Intl currencyDisplay value, so drop to a plain decimal and
  // let Intl keep the locale's grouping and separators.
  const options: Intl.NumberFormatOptions = display === 'none'
    ? { style: 'decimal' }
    : { style: 'currency', currency: fmt.currency, currencyDisplay: display };

  return new Intl.NumberFormat(fmt.locale, {
    ...options,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(amount);
};

export const formatNumber = (
  amount: number,
  locale: string = 'en-US',
  options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
): string => {
  return new Intl.NumberFormat(locale, options).format(amount);
};

export const parseCurrency = (
  value: string,
  currencyCode: CurrencyCode = 'USD'
): number | null => {
  const usesCommaAsDecimal = currencyCode === 'BRL' || currencyCode === 'EUR';

  // Remove everything that is not a digit, a comma, a dot or a minus sign.
  let cleanValue = value.replace(/[^0-9.,-]/g, '');

  if (usesCommaAsDecimal) {
    // For BRL/EUR, remove dots (thousands separators) and then replace comma (decimal) with a dot.
    cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
  } else {
    // For USD and others, remove commas (thousands separators). The dot is already the decimal separator.
    cleanValue = cleanValue.replace(/,/g, '');
  }

  const result = parseFloat(cleanValue);
  return isNaN(result) ? null : result;
};

// Round a money value to cents. Prevents binary floating-point drift (e.g.
// 0.1+0.2 = 0.30000000000000004) from leaking into displayed or persisted sums.
export const roundCents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const getCurrencyOptions = (): { value: CurrencyCode; label: string }[] => {
  return [
    { value: 'USD', label: 'USD ($) - US Dollar' },
    { value: 'EUR', label: 'EUR (€) - Euro' },
    { value: 'GBP', label: 'GBP (£) - British Pound' },
    { value: 'JPY', label: 'JPY (¥) - Japanese Yen' },
    { value: 'CNY', label: 'CNY (¥) - Chinese Yuan' },
    { value: 'BRL', label: 'BRL (R$) - Brazilian Real' },
    { value: 'MXN', label: 'MXN ($) - Mexican Peso' },
    { value: 'CAD', label: 'CAD ($) - Canadian Dollar' },
    { value: 'AUD', label: 'AUD ($) - Australian Dollar' },
    { value: 'INR', label: 'INR (₹) - Indian Rupee' },
  ];
};

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

// Decimal count really is a currency property, unlike punctuation: JPY has no
// minor unit in any locale.
export const getCurrencyPrecision = (currencyCode: CurrencyCode): number => {
  return (currencyConfigs[currencyCode] || currencyConfigs.USD).precision;
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

// Punctuation belongs to the locale, never to the currency: EUR reads 1,234.56
// in en-US and 1.234,56 in de-DE. Deriving it from the currency is what made
// "45,90" parse as 4590 for a USD user whose locale is pt-BR.
export const getNumberSeparators = (locale: string): { group: string; decimal: string } => {
  const parts = new Intl.NumberFormat(locale).formatToParts(123456.7);
  return {
    group: parts.find(p => p.type === 'group')?.value ?? ',',
    decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
  };
};

export const parseCurrency = (
  value: string,
  locale: string = 'en-US'
): number | null => {
  const { decimal } = getNumberSeparators(locale);

  // Drop the currency marker and any grouping mark the locale might use —
  // including de-CH's apostrophe and fr-FR's narrow no-break space.
  let cleanValue = value.replace(/[^0-9.,-]/g, '');
  cleanValue = cleanValue.split(decimal === ',' ? '.' : ',').join('');
  if (decimal !== '.') {
    cleanValue = cleanValue.replace(decimal, '.');
  }

  const result = parseFloat(cleanValue);
  return isNaN(result) ? null : result;
};

// Round a money value to cents. Prevents binary floating-point drift (e.g.
// 0.1+0.2 = 0.30000000000000004) from leaking into displayed or persisted sums.
export const roundCents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Every option in the formatting settings is rendered by the same formatter the
// rest of the app uses, so the label IS the sample and can never claim a format
// the app will not produce. A static "CAD ($)" lied: under en-US the app shows
// CA$, and under pt-BR USD shows US$.
const SAMPLE_AMOUNT = 1234.56;

// Grouping only differs above six digits (en-IN's lakh), so the number-format
// sample needs to be wider than the currency one.
const SAMPLE_GROUPED = 123456.78;

export const getCurrencyOptions = (
  locale: string,
  language: string = locale
): { value: CurrencyCode; label: string }[] => {
  const names = new Intl.DisplayNames([language], { type: 'currency' });
  return (Object.keys(currencyConfigs) as CurrencyCode[]).map(value => ({
    value,
    label: `${value} — ${formatMoney(SAMPLE_AMOUNT, { currency: value, locale })} · ${names.of(value) ?? value}`,
  }));
};

// The picker used to list 13 locales by name, but they collapse into only three
// distinct punctuations — ten of the options rendered identically. Offer the
// punctuation itself instead; the locale stays the stored value.
const NUMBER_FORMAT_LOCALES = ['en-US', 'pt-BR', 'fr-FR', 'de-CH', 'en-IN'];

export const getNumberFormatOptions = (current?: string): { value: string; label: string }[] => {
  const bySample = new Map<string, string>();
  for (const candidate of NUMBER_FORMAT_LOCALES) {
    const sample = new Intl.NumberFormat(candidate).format(SAMPLE_GROUPED);
    if (!bySample.has(sample)) bySample.set(sample, candidate);
  }
  // Keep whatever is stored as the value for its punctuation, so a locale that
  // merely renders the same (es-ES vs pt-BR) is not silently rewritten.
  if (current) {
    bySample.set(new Intl.NumberFormat(current).format(SAMPLE_GROUPED), current);
  }
  return Array.from(bySample, ([label, value]) => ({ value, label }));
};

// Deliberately omits Intl's 'name' display: spelling the currency out belongs in
// the currency picker, not in every amount on screen.
export const getCurrencyDisplayOptions = (
  currency: CurrencyCode,
  locale: string
): { value: CurrencyDisplay; label: string }[] => {
  const byLabel = new Map<string, CurrencyDisplay>();
  for (const display of ['symbol', 'narrowSymbol', 'code', 'none'] as CurrencyDisplay[]) {
    const label = formatMoney(SAMPLE_AMOUNT, { currency, locale, currencyDisplay: display });
    if (!byLabel.has(label)) byLabel.set(label, display);
  }
  return Array.from(byLabel, ([label, value]) => ({ value, label }));
};

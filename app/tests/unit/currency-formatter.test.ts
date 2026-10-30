import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatNumber,
  parseCurrency,
  getCurrencyOptions,
  getNumberFormatOptions,
  getCurrencyDisplayOptions,
  roundCents,
  CurrencyCode,
} from '../../client/src/lib/currency-formatter';

// Intl separates symbol from digits with a non-breaking space in several locales.
const norm = (s: string) => s.replace(/\s/g, ' ');

describe('currency-formatter', () => {
  describe('formatMoney', () => {
    it('should format a USD amount with US punctuation', () => {
      expect(formatMoney(1234.56, { currency: 'USD', locale: 'en-US' })).toBe('$1,234.56');
    });

    it('should format a BRL amount with Brazilian punctuation', () => {
      expect(norm(formatMoney(1234.56, { currency: 'BRL', locale: 'pt-BR' }))).toBe('R$ 1.234,56');
    });

    it('should punctuate by locale rather than by currency', () => {
      // The whole point of taking locale: the same currency renders differently
      // depending on the user's choice, instead of being pinned to en-US.
      expect(norm(formatMoney(1234.56, { currency: 'USD', locale: 'pt-BR' }))).toBe('US$ 1.234,56');
      expect(norm(formatMoney(1234.56, { currency: 'EUR', locale: 'fr-FR' }))).toBe('1 234,56 €');
    });

    it('should format a negative amount', () => {
      expect(norm(formatMoney(-500, { currency: 'EUR', locale: 'de-DE' }))).toMatch(/-?500,00 ?€/);
    });

    it('should drop the fractional part for a zero-precision currency', () => {
      expect(formatMoney(2000, { currency: 'JPY', locale: 'ja-JP' })).toMatch(/[¥￥]2,000$/);
    });

    it('should handle zero', () => {
      expect(formatMoney(0, { currency: 'GBP', locale: 'en-GB' })).toBe('£0.00');
    });

    it('should render the currency code when asked', () => {
      expect(norm(formatMoney(1234.56, { currency: 'BRL', locale: 'pt-BR', currencyDisplay: 'code' })))
        .toBe('BRL 1.234,56');
    });

    it('should drop the currency label entirely for currencyDisplay none', () => {
      expect(formatMoney(1234.56, { currency: 'BRL', locale: 'pt-BR', currencyDisplay: 'none' }))
        .toBe('1.234,56');
    });

    it('should round to whole units when hiding cents', () => {
      expect(norm(formatMoney(1234.56, { currency: 'BRL', locale: 'pt-BR', hideCents: true })))
        .toBe('R$ 1.235');
    });

    it('should let an explicit precision win over hideCents', () => {
      expect(norm(formatMoney(1234.56, { currency: 'BRL', locale: 'pt-BR', hideCents: true, precision: 2 })))
        .toBe('R$ 1.234,56');
    });

    it('should shorten thousands and punctuate them by locale', () => {
      expect(norm(formatMoney(6452, { currency: 'BRL', locale: 'pt-BR', compact: true })))
        .toBe('R$ 6,5k');
      expect(formatMoney(6452, { currency: 'USD', locale: 'en-US', compact: true }))
        .toBe('$6.5k');
      expect(norm(formatMoney(-17492, { currency: 'BRL', locale: 'pt-BR', compact: true })))
        .toBe('-R$ 17,5k');
    });

    it('should leave amounts under a thousand alone when compact', () => {
      expect(norm(formatMoney(452, { currency: 'BRL', locale: 'pt-BR', compact: true, precision: 0 })))
        .toBe('R$ 452');
    });
  });

  describe('formatNumber', () => {
    it('should format a number with default options', () => {
      expect(formatNumber(1234.567)).toBe('1,234.57');
    });

    it('should format a number with custom options', () => {
      // German locale uses a comma as the decimal separator
      expect(formatNumber(1234.567, 'de-DE', { minimumFractionDigits: 3 })).toBe('1.234,567');
    });
  });

  describe('parseCurrency', () => {
    it('should parse a simple USD currency string', () => {
      expect(parseCurrency('$1,234.56')).toBe(1234.56);
    });

    it('should parse a comma-decimal string in a comma-decimal locale', () => {
      expect(parseCurrency('R$1.234,56', 'pt-BR')).toBe(1234.56);
    });

    it('should parse a EUR amount using the locale, not the currency', () => {
      expect(parseCurrency('€500,00', 'de-DE')).toBe(500.00);
      expect(parseCurrency('€500.00', 'en-US')).toBe(500.00);
    });

    it('should return null for an invalid currency string', () => {
      expect(parseCurrency('not a number')).toBe(null);
    });

    it('should handle negative numbers', () => {
      expect(parseCurrency('-$50.25')).toBe(-50.25);
    });

    it('should handle values with no fractional part', () => {
      expect(parseCurrency('¥2000', 'ja-JP')).toBe(2000);
    });

    it('should read punctuation from the locale even when it is not the currency home', () => {
      // A USD user whose locale is pt-BR types "45,90" and means 45.90.
      expect(parseCurrency('45,90', 'pt-BR')).toBe(45.9);
      expect(parseCurrency('1.234,56', 'pt-BR')).toBe(1234.56);
    });

    it('should handle apostrophe and narrow-space grouping', () => {
      expect(parseCurrency("1'234.56", 'de-CH')).toBe(1234.56);
      expect(parseCurrency('1 234,56', 'fr-FR')).toBe(1234.56);
    });

    it('should handle lakh grouping', () => {
      expect(parseCurrency('1,23,456.78', 'en-IN')).toBe(123456.78);
    });
  });

  describe('roundCents', () => {
    it('should round the classic 0.1 + 0.2 drift to 0.3', () => {
      expect(roundCents(0.1 + 0.2)).toBe(0.3);
    });

    it('should round a sum of three splits to exactly 2 decimal places', () => {
      const splits = ['10.10', '20.20', '5.55'];
      const total = splits.reduce((sum, s) => sum + parseFloat(s), 0);
      expect(roundCents(total)).toBe(35.85);
    });

    it('should round negative amounts toward the nearest cent', () => {
      // -29.999999 (typical negative drift) → -30.00
      expect(roundCents(-29.999999)).toBe(-30);
    });

    it('should leave already-exact values unchanged', () => {
      expect(roundCents(1234.56)).toBe(1234.56);
    });
  });

  describe('getCurrencyOptions', () => {
    it('should return an array of currency options', () => {
      const options = getCurrencyOptions('en-US');
      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toHaveProperty('value');
      expect(options[0]).toHaveProperty('label');
    });

    it('should include major currencies', () => {
      const codes = getCurrencyOptions('en-US').map(o => o.value);
      expect(codes).toContain('USD');
      expect(codes).toContain('EUR');
      expect(codes).toContain('BRL');
    });

    it('should render the symbol the app will actually show, which is locale-dependent', () => {
      const under = (locale: string, code: CurrencyCode) =>
        norm(getCurrencyOptions(locale, 'en').find(o => o.value === code)!.label);

      // A static "CAD ($)" label was wrong: en-US renders CA$.
      expect(under('en-US', 'CAD')).toContain('CA$');
      expect(under('pt-BR', 'USD')).toContain('US$');
      expect(under('en-US', 'USD')).toContain('$1,234.56');
    });
  });

  describe('getNumberFormatOptions', () => {
    it('should offer one option per distinct punctuation', () => {
      const labels = getNumberFormatOptions().map(o => norm(o.label));
      expect(labels).toEqual([
        '123,456.78',
        '123.456,78',
        '123 456,78',
        "123'456.78",
        '1,23,456.78',
      ]);
    });

    it('should keep an equivalent stored locale as the value for its punctuation', () => {
      // es-ES punctuates exactly like pt-BR, so it must not be rewritten.
      const options = getNumberFormatOptions('es-ES');
      expect(options.map(o => o.value)).toContain('es-ES');
      expect(options.map(o => o.value)).not.toContain('pt-BR');
      expect(options).toHaveLength(5);
    });

    it('should append a stored locale that punctuates unlike any offered one', () => {
      const options = getNumberFormatOptions('de-AT');
      expect(options.map(o => o.value)).toContain('de-AT');
    });
  });

  describe('getCurrencyDisplayOptions', () => {
    it('should collapse display modes that render identically', () => {
      // BRL is R$ as both symbol and narrowSymbol, so only one of them is offered.
      const options = getCurrencyDisplayOptions('BRL', 'pt-BR');
      expect(options.map(o => o.value)).toEqual(['symbol', 'code', 'none']);
    });

    it('should keep the narrow symbol when it differs from the full one', () => {
      const options = getCurrencyDisplayOptions('USD', 'pt-BR');
      expect(options.map(o => o.value)).toContain('narrowSymbol');
      expect(norm(options.find(o => o.value === 'symbol')!.label)).toContain('US$');
      expect(norm(options.find(o => o.value === 'narrowSymbol')!.label)).toContain('$ ');
    });

    it('should never offer the spelled-out currency name', () => {
      const labels = getCurrencyDisplayOptions('BRL', 'pt-BR').map(o => o.label.toLowerCase());
      expect(labels.some(l => l.includes('real'))).toBe(false);
    });
  });
});

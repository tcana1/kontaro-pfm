import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatNumber,
  parseCurrency,
  getCurrencyOptions,
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

    it('should parse a BRL currency string with a comma decimal separator', () => {
      expect(parseCurrency('R$1.234,56', 'BRL')).toBe(1234.56);
    });

    it('should parse a EUR currency string', () => {
      expect(parseCurrency('€500,00', 'EUR')).toBe(500.00);
    });

    it('should return null for an invalid currency string', () => {
      expect(parseCurrency('not a number')).toBe(null);
    });

    it('should handle negative numbers', () => {
      expect(parseCurrency('-$50.25')).toBe(-50.25);
    });

    it('should handle values with no fractional part', () => {
      expect(parseCurrency('¥2000', 'JPY')).toBe(2000);
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
      const options = getCurrencyOptions();
      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toHaveProperty('value');
      expect(options[0]).toHaveProperty('label');
    });

    it('should include major currencies', () => {
      const options = getCurrencyOptions();
      const codes = options.map(o => o.value);
      expect(codes).toContain('USD');
      expect(codes).toContain('EUR');
      expect(codes).toContain('BRL');
    });
  });
});

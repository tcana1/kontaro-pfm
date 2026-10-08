import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatNumber,
  parseCurrency,
  getCurrencyOptions,
  roundCents,
  CurrencyCode,
} from '../../client/src/lib/currency-formatter';

describe('currency-formatter', () => {
  describe('formatCurrency', () => {
    it('should format a positive number to a USD currency string by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format a positive number to a BRL currency string', () => {
      const formatted = formatCurrency(1234.56, 'BRL');
      // Allow for non-breaking space and different decimal separators
      expect(formatted.replace(/\s/g, ' ').replace(',', '.')).toBe('R$ 1.234.56');
    });

    it('should format a negative number to a EUR currency string', () => {
      const formatted = formatCurrency(-500, 'EUR');
      // Different locales might place the minus sign differently.
      // This regex checks for €-500,00 or -€500,00 or -500,00 € etc.
      expect(formatted.replace(/\s/g, ' ')).toMatch(/-?€?500,00€?/);
    });

    it('should format a number with no fractional part for JPY', () => {
      // Check for both half-width and full-width yen symbols
      expect(formatCurrency(2000, 'JPY')).toMatch(/[¥￥]2,000/);
    });

    it('should handle zero correctly', () => {
      expect(formatCurrency(0, 'GBP')).toBe('£0.00');
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

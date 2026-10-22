import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  editDateRange,
  toISODateString,
  formatDateForDisplay,
  parseDateForDatabase,
  isValidISODate,
  getTodayISO,
  localDateString,
  localDateFromString,
  parseDate,
  parseDateInput,
  getLocalePlaceholder,
  normalizeDateFormat,
  formatDateRangeLabel,
  formatDateForLocaleInput,
  type DateParseResult
} from '../../client/src/lib/date-utils';

describe('date-utils', () => {
  describe('localDateFromString', () => {
    it('returns local midnight, not UTC midnight', () => {
      const parsed = localDateFromString('2026-03-01')!;
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(2);
      expect(parsed.getDate()).toBe(1);
      expect(parsed.getHours()).toBe(0);
    });

    it('round-trips with localDateString', () => {
      for (const iso of ['2026-01-01', '2026-03-01', '2026-06-15', '2026-12-31']) {
        expect(localDateString(localDateFromString(iso)!)).toBe(iso);
      }
    });

    it('does not shift the day the way new Date() does west of Greenwich', () => {
      // The regression this guards: new Date('2026-03-01') parses the date-only ISO
      // form as UTC, so getDate() returns 28 at UTC-3. Only meaningful when the test
      // runs at a negative offset, hence the guard.
      const parsed = localDateFromString('2026-03-01')!;
      if (parsed.getTimezoneOffset() > 0) {
        expect(parsed.getDate()).not.toBe(new Date('2026-03-01').getDate());
      }
      expect(parsed.getDate()).toBe(1);
    });

    it('rejects malformed and out-of-range input', () => {
      expect(localDateFromString('')).toBeNull();
      expect(localDateFromString('01/03/2026')).toBeNull();
      expect(localDateFromString('2026-3-1')).toBeNull();
      expect(localDateFromString('2026-13-01')).toBeNull();
      expect(localDateFromString('2026-02-30')).toBeNull();
    });
  });

  describe('toISODateString', () => {
    it('should convert a Date object to an ISO string', () => {
      const date = new Date('2023-10-26T10:00:00Z');
      expect(toISODateString(date)).toBe('2023-10-26');
    });

    it('should return the same string if already in ISO format', () => {
      expect(toISODateString('2023-10-26')).toBe('2023-10-26');
    });

    it('should convert a date string in MM/DD/YYYY format', () => {
      expect(toISODateString('10/26/2023')).toBe('2023-10-26');
    });
  });

  describe('formatDateForDisplay', () => {
    it('should format an ISO date to MM/DD/YYYY by default', () => {
      expect(formatDateForDisplay('2023-10-26')).toBe('10/26/2023');
    });

    it('should format an ISO date to DD/MM/YYYY', () => {
      expect(formatDateForDisplay('2023-10-26', 'en-US', 'DD/MM/YYYY')).toBe('26/10/2023');
    });

    it('should format an ISO date to a long format', () => {
      expect(formatDateForDisplay('2023-12-25', 'en-US', 'long')).toBe('December 25, 2023');
    });

    it('should handle different locales for month names', () => {
      expect(formatDateForDisplay('2023-12-25', 'es-ES', 'long')).toBe('diciembre 25, 2023');
    });
  });

  describe('parseDateForDatabase', () => {
    it('should parse a MM/DD/YYYY string to ISO format', () => {
      expect(parseDateForDatabase('10/26/2023')).toBe('2023-10-26');
    });

    it('should parse a DD/MM/YYYY string to ISO format', () => {
      expect(parseDateForDatabase('26/10/2023', 'DD/MM/YYYY')).toBe('2023-10-26');
    });

    it('should return null for an invalid date string', () => {
      expect(parseDateForDatabase('not a date')).toBe(null);
    });

    it('should handle different separators', () => {
      expect(parseDateForDatabase('10-26-2023', 'MM-DD-YYYY')).toBe('2023-10-26');
    });
  });

  describe('isValidISODate', () => {
    it('should return true for a valid ISO date string', () => {
      expect(isValidISODate('2023-10-26')).toBe(true);
    });

    it('should return false for an invalid ISO date string', () => {
      expect(isValidISODate('2023-13-40')).toBe(false);
    });

    it('should return false for a leap year date that is not a leap year', () => {
      expect(isValidISODate('2023-02-29')).toBe(false);
    });

    it('should return true for a leap year date that is a leap year', () => {
      expect(isValidISODate('2024-02-29')).toBe(true);
    });
  });

  describe('getTodayISO', () => {
    it('should return a string in YYYY-MM-DD format', () => {
      const today = getTodayISO();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('parseDate', () => {
    it('should parse a date string and return a Date object', () => {
      const date = parseDate('10/26/2023');
      expect(date).toBeInstanceOf(Date);
      if (date) {
        expect(date.getUTCFullYear()).toBe(2023);
        expect(date.getUTCMonth()).toBe(9); // Month is 0-indexed
        expect(date.getUTCDate()).toBe(26);
      }
    });
  });

  describe('Hybrid Date Input Functions', () => {
    beforeEach(() => {
      // Mock current date to January 15, 2025 for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('parseDateInput', () => {
      describe('empty input', () => {
        it('should handle empty input', () => {
          const result = parseDateInput('', 'en-US', 'MM/DD/YYYY');
          expect(result).toEqual({
            isValid: false,
            date: null,
            formatted: '',
            partial: false
          });
        });
      });

      describe('shortcuts', () => {
        it('should handle "today" shortcut', () => {
          const result = parseDateInput('today', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.date).toBeInstanceOf(Date);
          expect(result.partial).toBe(false);
          expect(result.formatted).toBe('01/15/2025');
        });

        it('should handle "tomorrow" shortcut', () => {
          const result = parseDateInput('tomorrow', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.date).toBeInstanceOf(Date);
          expect(result.partial).toBe(false);
          expect(result.formatted).toBe('01/16/2025');
        });

        it('should handle relative dates', () => {
          const result = parseDateInput('7', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.date).toBeInstanceOf(Date);
          expect(result.partial).toBe(false);
          expect(result.formatted).toBe('01/22/2025'); // 7 days from Jan 15
        });

        it('should handle relative dates with plus sign', () => {
          const result = parseDateInput('+3', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.date).toBeInstanceOf(Date);
          expect(result.formatted).toBe('01/18/2025'); // 3 days from Jan 15
        });
      });

      describe('partial input', () => {
        it('should treat single digit as relative date shortcut', () => {
          const result = parseDateInput('1', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.partial).toBe(false);
          expect(result.formatted).toBe('01/16/2025'); // 1 day from Jan 15
        });

        it('should treat two digits as relative date shortcut', () => {
          const result = parseDateInput('12', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.partial).toBe(false);
          expect(result.formatted).toBe('01/27/2025'); // 12 days from Jan 15
        });

        it('should handle partial MM/DD input', () => {
          const result = parseDateInput('03/15', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.partial).toBe(true);
          expect(result.date).toBeInstanceOf(Date);
          expect(result.date?.getFullYear()).toBe(2025); // Current year
          expect(result.date?.getMonth()).toBe(2); // March
          expect(result.date?.getDate()).toBe(15);
        });

        it('should handle partial DD/MM input for European format', () => {
          const result = parseDateInput('15/03', 'en-GB', 'DD/MM/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.partial).toBe(true);
          expect(result.date?.getMonth()).toBe(2); // March
          expect(result.date?.getDate()).toBe(15);
        });
      });

      describe('complete input', () => {
        it('should parse complete MM/DD/YYYY date', () => {
          const result = parseDateInput('03/15/2024', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.partial).toBe(false);
          expect(result.date).toBeInstanceOf(Date);
          expect(result.date?.getFullYear()).toBe(2024);
          expect(result.date?.getMonth()).toBe(2); // March
          expect(result.date?.getDate()).toBe(15);
        });

        it('should parse complete DD/MM/YYYY date', () => {
          const result = parseDateInput('15/03/2024', 'en-GB', 'DD/MM/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.partial).toBe(false);
          expect(result.date?.getFullYear()).toBe(2024);
          expect(result.date?.getMonth()).toBe(2); // March
          expect(result.date?.getDate()).toBe(15);
        });

        it('should handle different separators', () => {
          const result1 = parseDateInput('03-15-2024', 'en-US', 'MM/DD/YYYY');
          const result2 = parseDateInput('03.15.2024', 'en-US', 'MM/DD/YYYY');
          
          expect(result1.isValid).toBe(true);
          expect(result2.isValid).toBe(true);
          expect(result1.date?.getMonth()).toBe(2);
          expect(result2.date?.getMonth()).toBe(2);
        });

        it('should handle 2-digit years', () => {
          const result = parseDateInput('03/15/24', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(true);
          expect(result.date?.getFullYear()).toBe(2024); // Should assume 2000s for recent years
        });
      });

      describe('error handling', () => {
        it('should return error for invalid month', () => {
          const result = parseDateInput('13/15/2024', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
        });

        it('should return error for invalid day', () => {
          const result = parseDateInput('02/30/2024', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
        });

        it('should return error for malformed input', () => {
          const result = parseDateInput('not-a-date', 'en-US', 'MM/DD/YYYY');
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
        });
      });
    });

    describe('getLocalePlaceholder', () => {
      it('should return correct placeholder for US format', () => {
        expect(getLocalePlaceholder('en-US', 'MM/DD/YYYY')).toBe('MM/DD/YYYY');
      });

      it('should return correct placeholder for European format', () => {
        expect(getLocalePlaceholder('en-GB', 'DD/MM/YYYY')).toBe('DD/MM/YYYY');
      });

      it('should return correct placeholder for ISO format', () => {
        expect(getLocalePlaceholder('en-US', 'YYYY-MM-DD')).toBe('YYYY-MM-DD');
      });
    });

    describe('formatDateForLocaleInput', () => {
      it('should format date for US locale input', () => {
        const date = new Date('2024-03-15T12:00:00Z');
        expect(formatDateForLocaleInput(date, 'en-US', 'MM/DD/YYYY')).toBe('03/15/2024');
      });

      it('should format date for European locale input', () => {
        const date = new Date('2024-03-15T12:00:00Z');
        expect(formatDateForLocaleInput(date, 'en-GB', 'DD/MM/YYYY')).toBe('15/03/2024');
      });

      it('should format date for ISO format input', () => {
        const date = new Date('2024-03-15T12:00:00Z');
        expect(formatDateForLocaleInput(date, 'en-US', 'YYYY-MM-DD')).toBe('2024-03-15');
      });
    });
  });
});


describe('normalizeDateFormat', () => {
  it('keeps selectable formats', () => {
    expect(normalizeDateFormat('DD/MM/YYYY')).toBe('DD/MM/YYYY');
    expect(normalizeDateFormat('YYYY-MM-DD')).toBe('YYYY-MM-DD');
  });

  it("falls back to the default for 'default', empty and unknown values", () => {
    expect(normalizeDateFormat('default')).toBe('DD/MMM/YYYY');
    expect(normalizeDateFormat('')).toBe('DD/MMM/YYYY');
    expect(normalizeDateFormat(null)).toBe('DD/MMM/YYYY');
    expect(normalizeDateFormat(undefined)).toBe('DD/MMM/YYYY');
    expect(normalizeDateFormat('dd.mm.yyyy')).toBe('DD/MMM/YYYY');
  });
});

describe('formatDateRangeLabel', () => {
  it('returns the all-time label for a range starting in 1900, whatever the end date', () => {
    const start = new Date(1900, 0, 1);
    expect(formatDateRangeLabel(start, new Date(2026, 9, 6), 'en-US', 'DD/MM/YYYY', 'All Time')).toBe('All Time');
    expect(formatDateRangeLabel(start, new Date(2026, 8, 30), 'en-US', 'DD/MM/YYYY', 'All Time')).toBe('All Time');
  });

  it('formats both ends using the configured date format otherwise', () => {
    expect(
      formatDateRangeLabel(new Date(2026, 0, 1), new Date(2026, 0, 31), 'en-US', 'DD/MM/YYYY', 'All Time')
    ).toBe('01/01/2026 - 31/01/2026');
  });
});

describe('today at a late local hour', () => {
  it('uses the local calendar day, not the UTC day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 23, 30));
    try {
      expect(getTodayISO()).toBe('2026-10-06');
      expect(parseDateInput('today', 'en-US', 'YYYY-MM-DD').formatted).toBe('2026-10-06');
      expect(parseDateInput('tomorrow', 'en-US', 'YYYY-MM-DD').formatted).toBe('2026-10-07');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('editDateRange', () => {
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 8, 30);

  it('keeps the other end when the range stays valid', () => {
    expect(editDateRange(start, end, 'start', new Date(2026, 2, 1))).toEqual([new Date(2026, 2, 1), end]);
    expect(editDateRange(start, end, 'end', new Date(2026, 5, 30))).toEqual([start, new Date(2026, 5, 30)]);
  });

  it('drags the end to the new start when start moves past it', () => {
    const d = new Date(2026, 9, 1);
    expect(editDateRange(start, end, 'start', d)).toEqual([d, d]);
  });

  it('drags the start to the new end when end moves before it', () => {
    const d = new Date(2025, 11, 31);
    expect(editDateRange(start, end, 'end', d)).toEqual([d, d]);
  });

  it('accepts a single-day range', () => {
    expect(editDateRange(start, end, 'end', start)).toEqual([start, start]);
  });
});

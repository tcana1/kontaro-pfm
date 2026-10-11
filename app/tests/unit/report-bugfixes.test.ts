import { describe, it, expect } from 'vitest';
import { buildServiceQueryKey } from '@/hooks/useServiceQuery';
import { daysBetween } from '@/lib/date-utils';

describe('buildServiceQueryKey', () => {
  it('includes queryParams for array keys so different filters do not share a cache entry', () => {
    const a = buildServiceQueryKey(['get_merchant_scatter'], { queryParams: { start_date: '2026-09-01' } });
    const b = buildServiceQueryKey(['get_merchant_scatter'], { queryParams: { start_date: '2025-10-01' } });
    expect(a).not.toEqual(b);
  });

  it('keeps array keys without queryParams unchanged', () => {
    expect(buildServiceQueryKey(['categoryTransactionCount', 3])).toEqual(['categoryTransactionCount', 3]);
  });

  it('keeps including options for string keys', () => {
    const options = { rawQuery: true, queryParams: { a: 1 } };
    expect(buildServiceQueryKey('get_daily_spending', options)).toEqual(['get_daily_spending', options]);
  });
});

describe('daysBetween', () => {
  it('is inclusive of both ends', () => {
    expect(daysBetween('2026-10-09', '2026-10-11')).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('returns a single day when start equals end', () => {
    expect(daysBetween('2026-10-11', '2026-10-11')).toEqual(['2026-10-11']);
  });

  it('returns empty when start is after end', () => {
    expect(daysBetween('2026-10-12', '2026-10-11')).toEqual([]);
  });

  it('crosses month and leap-year boundaries', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('includes the last day over a range starting in 1900', () => {
    const days = daysBetween('1900-01-01', '2026-10-11');
    expect(days[0]).toBe('1900-01-01');
    expect(days[days.length - 1]).toBe('2026-10-11');
    expect(new Set(days).size).toBe(days.length);
  });
});

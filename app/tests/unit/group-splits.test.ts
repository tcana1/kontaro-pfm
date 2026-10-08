import { describe, it, expect } from 'vitest';
import { groupSplits } from '../../client/src/components/transactions/transaction-table-utils';

const row = (id: number, amount: string | null = '0', extra: Record<string, any> = {}) =>
  ({ id, amount, ...extra });

describe('groupSplits', () => {
  it('returns empty array for empty input', () => {
    expect(groupSplits([])).toEqual([]);
  });

  it('wraps a single row into a grouped entry', () => {
    const r = row(1, '100.00', { payee: 'ACME' });
    const result = groupSplits([r]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].splitCount).toBe(1);
    expect(result[0].splits).toHaveLength(1);
    expect(result[0].totalAmount).toBe('100.00');
    expect(result[0].payee).toBe('ACME');
  });

  it('groups two rows with the same id into one entry', () => {
    const result = groupSplits([row(1, '30'), row(1, '70')]);
    expect(result).toHaveLength(1);
    expect(result[0].splitCount).toBe(2);
    expect(result[0].splits).toHaveLength(2);
  });

  it('accumulates total amount across positive splits', () => {
    const result = groupSplits([row(1, '30'), row(1, '70')]);
    expect(result[0].totalAmount).toBe('100');
  });

  it('accumulates total amount across negative splits', () => {
    const result = groupSplits([row(1, '-50'), row(1, '-30')]);
    expect(result[0].totalAmount).toBe('-80');
  });

  it('keeps rows with different ids as separate entries', () => {
    const result = groupSplits([row(1, '100'), row(2, '200')]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it('preserves first-occurrence order across distinct ids', () => {
    const result = groupSplits([row(3, '10'), row(1, '20'), row(2, '30')]);
    expect(result.map(r => r.id)).toEqual([3, 1, 2]);
  });

  it('handles null amount without throwing', () => {
    const result = groupSplits([{ id: 1, amount: null }]);
    expect(result[0].totalAmount).toBe('0');
  });

  it('handles undefined amount without throwing', () => {
    const result = groupSplits([{ id: 1 }]);
    expect(result[0].totalAmount).toBe('0');
  });

  it('handles three splits and recalculates total correctly', () => {
    const result = groupSplits([row(1, '10'), row(1, '20'), row(1, '30')]);
    expect(result[0].splitCount).toBe(3);
    expect(result[0].totalAmount).toBe('60');
  });

  it('interleaves rows from different transactions correctly', () => {
    const result = groupSplits([row(1, '10'), row(2, '20'), row(1, '30')]);
    expect(result).toHaveLength(2);
    const tx1 = result.find(r => r.id === 1)!;
    expect(tx1.splitCount).toBe(2);
    expect(tx1.totalAmount).toBe('40');
  });
});

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransactionSelection } from '../../client/src/hooks/transactions/use-transaction-selection';

const makeTx = (id: number, amount: string, extra: Record<string, any> = {}) =>
  ({ id, amount, ...extra } as any);

describe('useTransactionSelection', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useTransactionSelection());
    expect(result.current.selectedTransactions).toEqual([]);
    expect(result.current.selectedTotal).toBe(0);
    expect(result.current.selectedIsSplit).toBe(false);
  });

  it('selectedTotal sums amounts of selected transactions', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([makeTx(1, '100'), makeTx(2, '50.50')]);
    });
    expect(result.current.selectedTotal).toBeCloseTo(150.5);
  });

  it('selectedTotal handles negative amounts', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([makeTx(1, '-200'), makeTx(2, '50')]);
    });
    expect(result.current.selectedTotal).toBeCloseTo(-150);
  });

  it('selectedTotal is 0 when no transactions selected', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([]);
    });
    expect(result.current.selectedTotal).toBe(0);
  });

  it('selectedIsSplit is false when no transactions selected', () => {
    const { result } = renderHook(() => useTransactionSelection());
    expect(result.current.selectedIsSplit).toBe(false);
  });

  it('selectedIsSplit is true for a single transaction with splitCount >= 2', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([makeTx(1, '100', { splitCount: 2 })]);
    });
    expect(result.current.selectedIsSplit).toBe(true);
  });

  it('selectedIsSplit is false for a single transaction with splitCount < 2', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([makeTx(1, '100', { splitCount: 1 })]);
    });
    expect(result.current.selectedIsSplit).toBe(false);
  });

  it('selectedIsSplit is false when more than one transaction is selected even if split', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([
        makeTx(1, '100', { splitCount: 3 }),
        makeTx(2, '50', { splitCount: 2 }),
      ]);
    });
    expect(result.current.selectedIsSplit).toBe(false);
  });

  it('setSelectedTransactions replaces the selection', () => {
    const { result } = renderHook(() => useTransactionSelection());
    act(() => {
      result.current.setSelectedTransactions([makeTx(1, '100')]);
    });
    act(() => {
      result.current.setSelectedTransactions([makeTx(2, '200'), makeTx(3, '300')]);
    });
    expect(result.current.selectedTransactions).toHaveLength(2);
    expect(result.current.selectedTotal).toBeCloseTo(500);
  });
});

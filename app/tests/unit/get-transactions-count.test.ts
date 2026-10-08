import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => {
  class FakeQuery {
    kind: 'base' | 'sibling';
    constructor(kind: 'base' | 'sibling') {
      this.kind = kind;
    }
    select() { return this; }
    or() { return this; }
    in() { return this; }
    eq() { return this; }
    gte() { return this; }
    lte() { return this; }
    order() { return this; }
    limit() { return this; }
    range() { return this; }
    then(resolve: any) {
      if (this.kind === 'base') {
        resolve({ data: state.baseRows, error: null, count: state.baseCount });
      } else {
        resolve({ data: state.siblingRows, error: null });
      }
    }
  }
  return {
    FakeQuery,
    baseRows: [] as any[],
    siblingRows: [] as any[],
    baseCount: 0,
    fromCalls: 0,
    rpcMock: vi.fn(),
  };
});

vi.mock('../../client/src/lib/supabase', () => ({
  supabase: {
    from: () => new state.FakeQuery(state.fromCalls++ === 0 ? 'base' : 'sibling'),
    rpc: state.rpcMock,
  },
}));

import { supabaseService } from '../../client/src/services/supabase-service';

const makeRow = (overrides: Record<string, any> = {}) => ({
  transaction_id: 1,
  user_id: 1,
  payment_date: '2026-09-01',
  purchase_date: '2026-09-01',
  payee: 'Split Payee',
  type: 'transaction',
  to_account_id: null,
  is_installment: false,
  installment_number: null,
  installment_total: null,
  split_id: 10,
  amount: 10.5,
  observation: '',
  account_id: 1,
  account_name: 'Chase Checking',
  account_type: 'checking',
  account_icon: null,
  status_id: 2,
  status_name: 'Cleared',
  is_ignored: false,
  category_id: 5,
  category_name: 'Dining',
  category_color: null,
  category_is_income: false,
  category_group_id: 2,
  category_group_name: 'Food',
  category_group_emoji: 'food',
  to_account_name: null,
  is_reconciled: false,
  transaction_amount: 30.5,
  tag_id: null,
  tag_name: null,
  tag_color: null,
  payee_unaccented: 'split payee',
  observation_unaccented: '',
  account_name_unaccented: 'chase checking',
  category_name_unaccented: 'dining',
  category_group_name_unaccented: 'food',
  tag_name_unaccented: null,
  ...overrides,
});

describe('getTransactions count under fan-out (P1-5)', () => {
  beforeEach(() => {
    state.baseRows = [];
    state.siblingRows = [];
    state.baseCount = 0;
    state.fromCalls = 0;
    state.rpcMock.mockReset();
    state.rpcMock.mockResolvedValue({ data: 1, error: null });
  });

  it('uses the RPC distinct-transaction count and keeps grouped rows coherent', async () => {
    // Transaction 1 has 2 splits; only split A (category 5) matches the filter,
    // so the base query returns 1 split row. Fan-out fetches both siblings.
    const splitA = makeRow({ split_id: 10, amount: 10.5, category_id: 5 });
    const splitB = makeRow({ split_id: 11, amount: 20.0, category_id: 6 });
    state.baseRows = [splitA];
    state.siblingRows = [splitA, splitB];
    state.baseCount = 1;

    const result = await supabaseService.getTransactions({
      filters: { categories: [5], user_id: 1 },
      limit: 50,
      offset: 0,
      sortBy: 'payment_date',
      sortDirection: 'desc',
      currency: 'USD',
    });

    expect(state.rpcMock).toHaveBeenCalledWith('count_filtered_transactions', expect.objectContaining({
      p_user_id: 1,
      p_categories: [5],
    }));
    expect(result.count).toBe(1);
    // Both sibling splits present, same transaction_id → grouped coherently
    expect(result.data).toHaveLength(2);
    expect(result.data.every((r: any) => r.transaction_id === 1)).toBe(true);
  });

  it('falls back to the split-level count when the RPC errors', async () => {
    state.baseRows = [makeRow()];
    state.siblingRows = [makeRow(), makeRow({ split_id: 11 })];
    state.baseCount = 7;
    state.rpcMock.mockResolvedValue({ data: null, error: { message: 'function not found' } });

    const result = await supabaseService.getTransactions({
      filters: { categories: [5], user_id: 1 },
      currency: 'USD',
    });

    expect(result.count).toBe(7);
  });

  it('uses the RPC count even without filters (multi-split correctness)', async () => {
    state.baseRows = [makeRow()];
    state.baseCount = 2; // 2 split rows in the base query
    state.rpcMock.mockResolvedValue({ data: 1, error: null }); // but 1 distinct transaction

    const result = await supabaseService.getTransactions({ limit: 50, offset: 0, currency: 'USD' });

    expect(state.rpcMock).toHaveBeenCalledWith('count_filtered_transactions', expect.objectContaining({
      p_categories: undefined,
      p_search: undefined,
    }));
    expect(result.count).toBe(1);
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => {
  class FakeQuery {
    results: any[];
    eqValues: any[] = [];
    constructor(results: any[]) {
      this.results = results;
    }
    select() { return this; }
    eq(...args: any[]) { this.eqValues.push(...args); return this; }
    neq() { return this; }
    single() { return this; }
    delete() { return this; }
    then(resolve: any) {
      state.allEqCalls.push(this.eqValues);
      resolve(this.results[0] ?? { data: null, error: null });
    }
  }
  return {
    FakeQuery,
    queue: [] as any[],
    allEqCalls: [] as any[][],
    reset() {
      this.queue = [];
      this.allEqCalls = [];
    },
  };
});

vi.mock('../../client/src/lib/supabase', () => ({
  supabase: {
    from: () => new state.FakeQuery(state.queue.shift() ?? []),
    rpc: vi.fn(),
  },
}));

import { supabaseService } from '../../client/src/services/supabase-service';

const currentTx = {
  id: 1,
  account_id: 10,
  to_account_id: 20,
  type: 'transfer',
  payment_date: '2026-09-01',
  amount: '-50.00',
  transfer_link_id: null,
};

describe('deleteLinkedTransactions heuristic (P2-4)', () => {
  beforeEach(() => {
    state.reset();
    (supabaseService as any).deletingTransactionIds.clear();
  });

  it('does not auto-delete a sibling when the heuristic match is ambiguous', async () => {
    // query 0: current transaction lookup
    // query 1: heuristic search → 2 candidates (ambiguous)
    // query 2: deleteRaw of the requested transaction only
    state.queue = [
      [{ data: currentTx, error: null }],
      [{ data: [{ id: 2 }, { id: 3 }], error: null }],
      [{ data: null, error: null }],
    ];

    const result = await supabaseService.deleteLinkedTransactions(1);

    expect(result).toBe(true);
    // Only 3 from() calls → no extra sibling delete ran
    expect(state.queue.length).toBe(0);
    expect(state.allEqCalls.length).toBe(3);
    // The final query (delete) targeted id 1, not a guessed sibling
    const deleteEq = state.allEqCalls[2];
    expect(deleteEq).toContain(1);
    expect(deleteEq).not.toContain(2);
    expect(deleteEq).not.toContain(3);
  });

  it('still deletes the unique sibling for a deterministic heuristic match', async () => {
    state.queue = [
      [{ data: currentTx, error: null }],
      [{ data: [{ id: 2 }], error: null }], // single deterministic candidate
      [{ data: null, error: null }],        // deleteRaw(sibling 2)
      [{ data: null, error: null }],        // deleteRaw(requested 1)
    ];

    const result = await supabaseService.deleteLinkedTransactions(1);

    expect(result).toBe(true);
    expect(state.allEqCalls.length).toBe(4);
    // Sibling delete ran (query 2) targeting id 2, then requested (query 3) id 1
    expect(state.allEqCalls[2]).toContain(2);
    expect(state.allEqCalls[3]).toContain(1);
  });
});
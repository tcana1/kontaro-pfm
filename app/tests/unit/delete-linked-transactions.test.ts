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
    maybeSingle() { return this; }
    delete() { return this; }
    then(resolve: any) {
      state.allEqCalls.push(this.eqValues);
      resolve(this.results[0] ?? { data: null, error: null });
    }
  }
  return {
    FakeQuery,
    queue: [] as any[],
    rpc: vi.fn(),
    allEqCalls: [] as any[][],
    reset() {
      this.queue = [];
      this.allEqCalls = [];
      this.rpc.mockReset();
    },
  };
});

vi.mock('../../client/src/lib/supabase', () => ({
  supabase: {
    from: () => new state.FakeQuery(state.queue.shift() ?? []),
    rpc: (...args: any[]) => state.rpc(...args),
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

describe('bulk delete (deleteMany)', () => {
  beforeEach(() => {
    state.reset();
    (supabaseService as any).deletingTransactionIds.clear();
  });

  it('deletes the whole selection with one RPC call and no per-row queries', async () => {
    state.rpc.mockResolvedValue({ data: [1, 2, 3, 4], error: null });

    const result = await supabaseService.deleteMany('transactions', [1, 2, 2, 3]);

    expect(result).toBe(true);
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith('delete_transactions', { p_ids: [1, 2, 3] });
    expect(state.allEqCalls.length).toBe(0);
  });

  it('does nothing for an empty selection', async () => {
    await expect(supabaseService.deleteMany('transactions', [])).resolves.toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('propagates RPC errors without falling back to row-by-row deletes', async () => {
    const failure = { code: 'P0001', message: 'Starting balance transactions cannot be deleted.' };
    state.rpc.mockResolvedValue({ data: null, error: failure });

    await expect(supabaseService.deleteMany('transactions', [1, 2])).rejects.toBe(failure);
    expect(state.allEqCalls.length).toBe(0);
  });

  it('falls back to per-row deletes, skipping partners already removed, when the RPC is not deployed', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const tx = (id: number, account_id: number, to_account_id: number, amount: string) => ({
      ...currentTx, id, account_id, to_account_id, amount,
    });
    state.queue = [
      // id 2 (pair 1<->2): lookup, heuristic -> 1, delete 1, delete 2
      [{ data: tx(2, 20, 10, '50.00'), error: null }],
      [{ data: [{ id: 1 }], error: null }],
      [{ data: null, error: null }],
      [{ data: null, error: null }],
      // id 1 is skipped (already deleted as partner)
      // id 4 (pair 3<->4): lookup, heuristic -> 3, delete 3, delete 4
      [{ data: tx(4, 20, 10, '70.00'), error: null }],
      [{ data: [{ id: 3 }], error: null }],
      [{ data: null, error: null }],
      [{ data: null, error: null }],
      // id 3 is skipped
    ];

    const result = await supabaseService.deleteMany('transactions', [2, 1, 4, 3]);

    expect(result).toBe(true);
    expect(state.queue.length).toBe(0);
    expect(state.allEqCalls.length).toBe(8);
    expect(state.allEqCalls[2]).toContain(1);
    expect(state.allEqCalls[3]).toContain(2);
    expect(state.allEqCalls[6]).toContain(3);
    expect(state.allEqCalls[7]).toContain(4);
  });
});

describe('deleteLinkedTransactions when the row is already gone', () => {
  beforeEach(() => {
    state.reset();
    (supabaseService as any).deletingTransactionIds.clear();
  });

  it('treats an already-deleted transaction as success instead of throwing', async () => {
    state.queue = [[{ data: null, error: null }]];

    await expect(supabaseService.deleteLinkedTransactions(99)).resolves.toBe(true);
    expect(state.allEqCalls.length).toBe(1);
  });
});

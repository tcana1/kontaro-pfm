import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  return { mockFrom };
});

vi.mock('../../client/src/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { findLinkedTransaction } from '../../client/src/services/transaction-query-helpers';

// Builds a chainable supabase query mock that resolves to `result` at the terminal call.
// UUID path ends with .single(); heuristic path ends implicitly (vitest awaits the chain).
function makeChain(result: { data: any; error: any }) {
  const p = Promise.resolve(result);
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    single: vi.fn(() => p),
    // Allow `await chain` to work for the heuristic path (no .single())
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return chain;
}

const baseTx = {
  id: 1,
  account_id: 10,
  to_account_id: 20,
  type: 'transfer',
  payment_date: '2024-01-15',
  amount: '100.00',
};

describe('findLinkedTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deterministic path (transfer_link_id present)', () => {
    it('returns the linked record on success', async () => {
      const linkedRecord = { id: 99, payee: 'Transfer to Savings' };
      const chain = makeChain({ data: linkedRecord, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await findLinkedTransaction({ ...baseTx, transfer_link_id: 'uuid-abc' });

      expect(mockFrom).toHaveBeenCalledWith('transactions');
      expect(chain.eq).toHaveBeenCalledWith('transfer_link_id', 'uuid-abc');
      expect(chain.neq).toHaveBeenCalledWith('id', 1);
      expect(result).toEqual(linkedRecord);
    });

    it('returns null when UUID lookup errors', async () => {
      const chain = makeChain({ data: null, error: { message: 'not found' } });
      mockFrom.mockReturnValue(chain);

      const result = await findLinkedTransaction({ ...baseTx, transfer_link_id: 'uuid-abc' });

      expect(result).toBeNull();
    });

    it('passes the select parameter to the query', async () => {
      const chain = makeChain({ data: { id: 99 }, error: null });
      mockFrom.mockReturnValue(chain);

      await findLinkedTransaction({ ...baseTx, transfer_link_id: 'uuid-abc' }, 'id');

      expect(chain.select).toHaveBeenCalledWith('id');
    });
  });

  describe('heuristic path (no transfer_link_id)', () => {
    it('returns first match when found', async () => {
      const linkedRecord = { id: 55, payee: 'Transfer from Checking' };
      const chain = makeChain({ data: [linkedRecord], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await findLinkedTransaction(baseTx);

      expect(chain.eq).toHaveBeenCalledWith('to_account_id', baseTx.account_id);
      expect(chain.eq).toHaveBeenCalledWith('account_id', baseTx.to_account_id);
      expect(chain.eq).toHaveBeenCalledWith('type', baseTx.type);
      expect(chain.eq).toHaveBeenCalledWith('payment_date', baseTx.payment_date);
      expect(chain.eq).toHaveBeenCalledWith('amount', -100);
      expect(result).toEqual(linkedRecord);
    });

    it('returns null when no heuristic matches', async () => {
      const chain = makeChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await findLinkedTransaction(baseTx);

      expect(result).toBeNull();
    });

    it('returns null when heuristic query errors', async () => {
      const chain = makeChain({ data: null, error: { message: 'db error' } });
      mockFrom.mockReturnValue(chain);

      const result = await findLinkedTransaction(baseTx);

      expect(result).toBeNull();
    });

    it('returns first record when multiple heuristic matches and logs warning', async () => {
      const matches = [{ id: 55 }, { id: 56 }];
      const chain = makeChain({ data: matches, error: null });
      mockFrom.mockReturnValue(chain);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await findLinkedTransaction(baseTx);

      expect(result).toEqual({ id: 55 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('multiple heuristic matches')
      );
      warnSpy.mockRestore();
    });

    it('negates the amount for heuristic match', async () => {
      const chain = makeChain({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      await findLinkedTransaction({ ...baseTx, amount: '-250.50' });

      expect(chain.eq).toHaveBeenCalledWith('amount', 250.5);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  DeleteTransactionCommand,
  UpdateTransactionStatusCommand,
} from '../../client/src/lib/commands/transaction-commands';
import { mockTransactions } from '../mocks/mock-data';

vi.mock('../../client/src/services/supabase-service', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    supabaseService: {
      ...actual.supabaseService,
      delete: vi.fn(),
      update: vi.fn(),
      createUniqueTransaction: vi.fn(),
    },
  };
});

import { supabaseService } from '../../client/src/services/supabase-service';

const LIST_KEY = ['transactions', 'list'] as const;

const makeClient = (tx: any) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(LIST_KEY, { data: [tx] });
  return qc;
};

const cachedTx = (qc: QueryClient, id: number) => {
  const cached = qc.getQueryData(LIST_KEY) as any;
  return cached?.data?.find((t: any) => t.id === id);
};

describe('Transaction commands — DB failure propagation (P0-1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DeleteTransactionCommand.execute rejects and restores the transaction in cache when DB fails', async () => {
    const tx = { ...mockTransactions[0], id: 101 };
    const qc = makeClient(tx);
    vi.mocked(supabaseService.delete).mockRejectedValueOnce(new Error('boom'));

    const command = new DeleteTransactionCommand(tx, qc);

    await expect(command.execute()).rejects.toThrow('boom');

    // Optimistic removal must be reverted
    expect(cachedTx(qc, 101)).toBeDefined();
    expect(supabaseService.delete).toHaveBeenCalledWith('transactions', 101);
  });

  it('DeleteTransactionCommand.execute removes from cache only after DB success', async () => {
    const tx = { ...mockTransactions[0], id: 102 };
    const qc = makeClient(tx);
    vi.mocked(supabaseService.delete).mockResolvedValueOnce({ data: null, error: null } as any);

    const command = new DeleteTransactionCommand(tx, qc);
    await command.execute();

    expect(cachedTx(qc, 102)).toBeUndefined();
  });

  it('DeleteTransactionCommand.unexecute rejects and removes the transaction from cache when restore fails', async () => {
    const tx = { ...mockTransactions[0], id: 103 };
    const qc = makeClient(tx);
    vi.mocked(supabaseService.createUniqueTransaction).mockRejectedValueOnce(new Error('restore failed'));

    const command = new DeleteTransactionCommand(tx, qc);

    await expect(command.unexecute()).rejects.toThrow('restore failed');

    // The optimistic restore must be reverted (transaction not left in cache)
    expect(cachedTx(qc, 103)).toBeUndefined();
  });

  it('UpdateTransactionStatusCommand.execute rejects and reverts status in cache when DB fails', async () => {
    const tx = { ...mockTransactions[0], id: 201, status_id: 1 };
    const qc = makeClient(tx);
    vi.mocked(supabaseService.update).mockRejectedValueOnce(new Error('db down'));

    const command = new UpdateTransactionStatusCommand(201, 1, 3, 'user-1', qc);

    await expect(command.execute()).rejects.toThrow('db down');

    expect(cachedTx(qc, 201)?.status_id).toBe(1);
  });

  it('UpdateTransactionStatusCommand.execute applies the new status in cache after DB success', async () => {
    const tx = { ...mockTransactions[0], id: 202, status_id: 1 };
    const qc = makeClient(tx);
    vi.mocked(supabaseService.update).mockResolvedValueOnce({ data: null, error: null } as any);

    const command = new UpdateTransactionStatusCommand(202, 1, 2, 'user-1', qc);
    await command.execute();

    expect(cachedTx(qc, 202)?.status_id).toBe(2);
    expect(supabaseService.update).toHaveBeenCalledWith('transactions', 202, {
      status_id: 2,
      user_id: 'user-1',
    });
  });

  it('UpdateTransactionStatusCommand.unexecute rejects and reverts status in cache when undo fails', async () => {
    // Cache reflects the already-executed state (status 2); undo reverts to the old status 1
    const tx = { ...mockTransactions[0], id: 203, status_id: 2 };
    const qc = makeClient(tx);
    vi.mocked(supabaseService.update).mockRejectedValueOnce(new Error('undo failed'));

    const command = new UpdateTransactionStatusCommand(203, 1, 2, 'user-1', qc);

    await expect(command.unexecute()).rejects.toThrow('undo failed');

    // Optimistic revert applied in cache even though DB failed (UI shows old status)
    expect(cachedTx(qc, 203)?.status_id).toBe(1);
  });
});

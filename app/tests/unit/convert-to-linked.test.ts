import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  currentRow: null as any,
}));

vi.mock('../../client/src/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { supabaseService } from '../../client/src/services/supabase-service';
import { UpdateTransactionCommand } from '../../client/src/lib/commands/transaction-commands';

const regularTx = {
  id: 7,
  type: 'transaction',
  account_id: 71,
  to_account_id: null,
  payment_date: '2026-10-09',
  payee: 'Cartao Itau The One',
  amount: -29459.76,
  notes: '',
  statement_identifier: 'pluggy:5835821e',
};

function selectQuery() {
  const q: any = {
    select: () => q,
    eq: () => q,
    single: () => q,
    then: (resolve: any) => resolve({ data: mocks.currentRow, error: null }),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentRow = regularTx;
  mocks.from.mockImplementation(() => selectQuery());
  mocks.rpc.mockResolvedValue({
    data: { primary: { id: 100 }, linked: { id: 101 } },
    error: null,
  });
});

describe('converting a regular transaction to a Payment/Transfer', () => {
  // Desktop row and mobile sheet both emit this camelCase shape.
  const formPayload = {
    id: 7,
    accountId: 71,
    toAccountId: 69,
    paymentDate: '2026-10-09',
    payee: 'Payment to Itaú The One',
    amount: -29459.76,
    categoryId: -4,
    notes: '',
    type: 'payment',
  };

  it('UpdateTransactionCommand calls the atomic RPC for camelCase form payloads', async () => {
    const command = new UpdateTransactionCommand(
      regularTx as any,
      formPayload as any,
      new QueryClient(),
    );

    await command.execute();
    await command.waitForDatabase();

    expect(command.isConversionInProgress()).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('convert_transaction_to_linked', {
      p_transaction_id: 7,
      p_updates: {
        account_id: 71,
        to_account_id: 69,
        payment_date: '2026-10-09',
        amount: -29459.76,
        payee: 'Payment to Itaú The One',
        notes: '',
        type: 'payment',
        category_id: -4,
      },
    });
    // No client-side create/delete: the RPC does both atomically.
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('UpdateTransactionCommand also handles snake_case payloads', async () => {
    const command = new UpdateTransactionCommand(
      regularTx as any,
      { type: 'transfer', to_account_id: 69, account_id: 71 } as any,
      new QueryClient(),
    );

    await command.execute();
    await command.waitForDatabase();

    expect(mocks.rpc).toHaveBeenCalledWith(
      'convert_transaction_to_linked',
      expect.objectContaining({
        p_transaction_id: 7,
        p_updates: expect.objectContaining({ type: 'transfer', to_account_id: 69 }),
      }),
    );
  });

  it('refuses reconciled transactions without touching the database', async () => {
    const command = new UpdateTransactionCommand(
      { ...regularTx, is_reconciled: true } as any,
      formPayload as any,
      new QueryClient(),
    );

    await expect(command.execute()).rejects.toThrow(/reconciled/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('supabaseService.update routes conversions to the RPC and returns the primary leg', async () => {
    const result = await supabaseService.update('transactions', 7, {
      type: 'payment',
      to_account_id: 69,
      account_id: 71,
      payee: 'Payment to Itaú The One',
      amount: -29459.76,
    });

    expect(result).toEqual({ id: 100 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe('convert_transaction_to_linked');
    expect(mocks.rpc.mock.calls[0][1].p_transaction_id).toBe(7);
  });

  it('propagates RPC errors from supabaseService.update', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Duplicate transaction found.') });

    await expect(
      supabaseService.update('transactions', 7, { type: 'payment', to_account_id: 69 }),
    ).rejects.toThrow('Duplicate transaction found.');
  });

  it('undo restores the original through a single RPC, using the snapshot the conversion returned', async () => {
    const snapshot = {
      primary: { id: 7 },
      linked: { id: 101 },
      original: { id: 7, unique_hash: 'h', statement_identifier: 'pluggy:5835821e' },
      original_splits: [{ category_id: -4, amount: -29459.76, observation: '' }],
    };
    mocks.rpc.mockResolvedValueOnce({ data: snapshot, error: null });

    const command = new UpdateTransactionCommand(regularTx as any, formPayload as any, new QueryClient());
    await command.execute();
    await command.waitForDatabase();
    mocks.rpc.mockResolvedValueOnce({ data: { original: { id: 7 } }, error: null });

    await command.unexecute();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith('undo_convert_transaction_to_linked', {
      p_transaction_id: 7,
      p_original: snapshot.original,
      p_original_splits: snapshot.original_splits,
    });
    // No client-side delete/create: that path used to drop unique_hash and fail half-way.
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('editing an existing Payment/Transfer pair', () => {
  const pairLeg = { ...regularTx, type: 'payment', to_account_id: 69 };

  it('sends the whole edit to update_linked_transactions in one call, including a type change', async () => {
    mocks.currentRow = pairLeg;
    mocks.rpc.mockResolvedValue({ data: { primary: { id: 7 }, linked: { id: 8 } }, error: null });

    const result = await supabaseService.update('transactions', 7, {
      type: 'transfer',
      account_id: 71,
      to_account_id: 69,
      amount: -50.55,
      notes: 'n',
      payee: 'ignored',
    });

    expect(result).toEqual({ id: 7 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('update_linked_transactions', {
      p_transaction_id: 7,
      p_updates: expect.objectContaining({ type: 'transfer', account_id: 71, to_account_id: 69, amount: -50.55, notes: 'n' }),
    });
    expect(mocks.rpc.mock.calls[0][1].p_updates).not.toHaveProperty('payee');
  });

  it('propagates update errors', async () => {
    mocks.currentRow = pairLeg;
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('Cannot edit a transfer/payment that has multiple splits') });

    await expect(
      supabaseService.update('transactions', 7, { type: 'payment', to_account_id: 69 }),
    ).rejects.toThrow('multiple splits');
  });
});

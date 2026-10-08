import { describe, it, expect } from 'vitest'
import { BatchEditValidator } from '@/utils/batch-edit-validator'
import type { Transaction } from '@shared/schema'

describe('BatchEditValidator', () => {
  const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 1,
    user_id: 'user123',
    type: 'transaction',
    account_id: 1,
    payment_date: '2024-01-01',
    purchase_date: '2024-01-01',
    payee: 'Test Store',
    amount: '100.00',
    description: 'Test transaction',
    notes: 'Test notes',
    unique_hash: 'hash123',
    category_id: 1,
    status_id: 1, // Pending
    is_reconciled: false,
    is_installment: false,
    installment_number: undefined,
    installment_total: undefined,
    to_account_id: undefined,
    to_account_name: undefined,
    category_name: 'Food',
    account_name: 'Checking',
    ...overrides
  } as Transaction);

  it('should allow all fields for pending transactions', () => {
    const transactions = [
      createMockTransaction(),
      createMockTransaction({ id: 2 })
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    expect(restrictions.allowedFields).toContain('notes');
    expect(restrictions.allowedFields).toContain('is_ignored');
    expect(restrictions.allowedFields).toContain('payment_date');
    expect(restrictions.allowedFields).toContain('category_id');
    expect(restrictions.allowedFields).toContain('account_id');
    expect(restrictions.allowedFields).toContain('status_id');
    expect(restrictions.disabledFields.size).toBe(0);
    expect(restrictions.canProceed).toBe(true);
  });

  it('should disable date and account fields for reconciled transactions', () => {
    const transactions = [
      createMockTransaction(),
      createMockTransaction({ id: 2, is_reconciled: true }) // Reconciled
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    expect(restrictions.disabledFields).toContain('payment_date');
    expect(restrictions.disabledFields).toContain('account_id');
    expect(restrictions.restrictionReasons.get('payment_date')).toBe('Cannot edit dates on reconciled transactions');
    expect(restrictions.restrictionReasons.get('account_id')).toBe('Cannot edit accounts on reconciled transactions');
    expect(restrictions.allowedFields).toContain('notes');
    expect(restrictions.allowedFields).toContain('is_ignored');
    expect(restrictions.allowedFields).toContain('category_id');
  });

  it('should disable account/category fields for transfer transactions', () => {
    const transactions = [
      createMockTransaction(),
      createMockTransaction({ id: 2, type: 'transfer' })
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    expect(restrictions.disabledFields).toContain('account_id');
    expect(restrictions.disabledFields).toContain('category_id');
    expect(restrictions.restrictionReasons.get('account_id')).toBe('Cannot batch edit accounts on transfers');
    expect(restrictions.restrictionReasons.get('category_id')).toBe('Cannot batch edit categories on transfers');
    expect(restrictions.allowedFields).toContain('notes');
    expect(restrictions.allowedFields).toContain('is_ignored');
    expect(restrictions.allowedFields).toContain('payment_date');
  });

  it('should disable account/category fields for payment transactions', () => {
    const transactions = [
      createMockTransaction(),
      createMockTransaction({ id: 2, type: 'payment' })
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    expect(restrictions.disabledFields).toContain('account_id');
    expect(restrictions.disabledFields).toContain('category_id');
    expect(restrictions.restrictionReasons.get('account_id')).toBe('Cannot batch edit accounts on transfers');
    expect(restrictions.restrictionReasons.get('category_id')).toBe('Cannot batch edit categories on transfers');
  });

  it('should not allow batch edit for linked transactions', () => {
    const transactions = [
      createMockTransaction(),
      createMockTransaction({ id: 2, to_account_id: 5 })
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    expect(restrictions.canProceed).toBe(false);
    expect(restrictions.restrictionReasons.get('linked_transactions')).toBe('Linked transactions (transfers/payments) cannot be batch edited');
  });

  it('should handle mixed selections with proper field restrictions', () => {
    const transactions = [
      createMockTransaction({ id: 1 }), // Pending
      createMockTransaction({ id: 2, is_reconciled: true }), // Reconciled
      createMockTransaction({ id: 3, type: 'transfer' }), // Transfer
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    // Should disable both date fields (due to reconciled) and account/category fields (due to transfer)
    expect(restrictions.disabledFields).toContain('payment_date');
    expect(restrictions.disabledFields).toContain('account_id');
    expect(restrictions.disabledFields).toContain('category_id');
    
    // Should still allow safe fields
    expect(restrictions.allowedFields).toContain('notes');
    expect(restrictions.allowedFields).toContain('is_ignored');
    expect(restrictions.allowedFields).toContain('status_id');
    
    // Should have restriction reasons
    expect(restrictions.restrictionReasons.get('payment_date')).toBe('Cannot edit dates on reconciled transactions');
    expect(restrictions.restrictionReasons.get('account_id')).toBe('Cannot batch edit accounts on transfers');
    expect(restrictions.restrictionReasons.get('category_id')).toBe('Cannot batch edit categories on transfers');
  });

  it('should not allow batch edit when linked transactions are present', () => {
    // Test with the most restrictive combination
    const transactions = [
      createMockTransaction({ id: 1, is_reconciled: true, type: 'transfer', to_account_id: 5 })
    ];

    const restrictions = BatchEditValidator.analyzeSelectedTransactions(transactions);

    expect(restrictions.canProceed).toBe(false);
    expect(restrictions.restrictionReasons.get('linked_transactions')).toBe('Linked transactions (transfers/payments) cannot be batch edited');
  });
});
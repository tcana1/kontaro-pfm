import { describe, it, expect } from 'vitest';

describe('Linked Transactions Logic Tests', () => {
  describe('Linked Transaction Data Generation', () => {
    it('should flip amount sign for transfers (debit becomes credit on the other side)', () => {
      const primaryData = {
        accountId: 1,
        toAccountId: 2,
        amount: -100,
        type: 'transfer',
        categoryId: -4,
      };

      const linkedData = {
        accountId: primaryData.toAccountId,
        toAccountId: primaryData.accountId,
        amount: primaryData.type === 'transfer' ? -primaryData.amount : primaryData.amount,
        type: primaryData.type,
        categoryId: primaryData.categoryId,
      };

      expect(linkedData.accountId).toBe(2);
      expect(linkedData.toAccountId).toBe(1);
      expect(linkedData.amount).toBe(100);
      expect(linkedData.categoryId).toBe(-4);
    });

    it('should keep same amount sign for payments', () => {
      const primaryData = {
        accountId: 1,
        toAccountId: 2,
        amount: 200,
        type: 'payment',
        categoryId: -4,
      };

      const linkedData = {
        accountId: primaryData.toAccountId,
        toAccountId: primaryData.accountId,
        amount: primaryData.type === 'transfer' ? -primaryData.amount : primaryData.amount,
        type: primaryData.type,
        categoryId: primaryData.categoryId,
      };

      expect(linkedData.amount).toBe(200);
    });
  });

  describe('Update Logic for Linked Transactions', () => {
    it('should negate amount update for transfers', () => {
      const currentTransaction = { type: 'transfer' };
      const updates = { amount: -150 };

      const linkedUpdates: Record<string, any> = {};
      if (updates.amount !== undefined) {
        linkedUpdates.amount =
          currentTransaction.type === 'transfer' ? -updates.amount : updates.amount;
      }

      expect(linkedUpdates.amount).toBe(150);
    });

    it('should keep same amount for payment updates', () => {
      const currentTransaction = { type: 'payment' };
      const updates = { amount: 250 };

      const linkedUpdates: Record<string, any> = {};
      if (updates.amount !== undefined) {
        linkedUpdates.amount =
          currentTransaction.type === 'transfer' ? -updates.amount : updates.amount;
      }

      expect(linkedUpdates.amount).toBe(250);
    });

    it('should swap accounts when toAccountId changes', () => {
      const currentTransaction = { account_id: 1 };
      const updates = { toAccountId: 3, accountId: 1 };

      const linkedUpdates: Record<string, any> = {};
      if (updates.toAccountId) {
        linkedUpdates.accountId = updates.toAccountId;
        linkedUpdates.toAccountId = updates.accountId || currentTransaction.account_id;
      }

      expect(linkedUpdates.accountId).toBe(3);
      expect(linkedUpdates.toAccountId).toBe(1);
    });
  });

  describe('Enhanced Delete Matching (5-field criteria)', () => {
    it('should flip accounts and negate amount to find the linked transfer', () => {
      const tx = {
        account_id: 1,
        to_account_id: 2,
        type: 'transfer',
        payment_date: '2023-10-26',
        amount: '-100.00',
      };

      const criteria = {
        to_account_id: tx.account_id,
        account_id: tx.to_account_id,
        type: tx.type,
        payment_date: tx.payment_date,
        amount: -parseFloat(tx.amount),
      };

      expect(criteria.to_account_id).toBe(1);
      expect(criteria.account_id).toBe(2);
      expect(criteria.amount).toBe(100);
    });

    it('should handle decimal amounts without floating-point errors', () => {
      const amount = -parseFloat('-123.45');
      expect(amount).toBe(123.45);
    });
  });

  describe('Payee Filtering (exclude internal transfer payees from autocomplete)', () => {
    it('should exclude transfer/payment payees that have a toAccountId', () => {
      const transactions = [
        { payee: 'Grocery Store', type: 'transaction', to_account_id: null },
        { payee: 'Transfer to Savings', type: 'transfer', to_account_id: 2 },
        { payee: 'Payment to Credit Card', type: 'payment', to_account_id: 3 },
        { payee: 'Salary', type: 'income', to_account_id: null },
        { payee: 'External Payment', type: 'payment', to_account_id: null },
      ];

      const filteredPayees = transactions
        .filter(
          (t) => !(['transfer', 'payment'].includes(t.type) && t.to_account_id !== null)
        )
        .map((t) => t.payee);

      expect(filteredPayees).toEqual(['Grocery Store', 'Salary', 'External Payment']);
    });
  });
});

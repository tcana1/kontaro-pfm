import { describe, it, expect } from 'vitest';
import {
  createCreditCardPaymentTransaction,
  excludeTransfersAndPayments,
  isCreditCard,
  generatePaymentPayeeName,
  parsePaymentPayee,
} from '../../client/src/utils/transfer-utils';
import { Account, Transaction } from '@shared/schema';

describe('transfer-utils', () => {
  describe('createCreditCardPaymentTransaction', () => {
    it('should create a positive transaction for a credit card payment', () => {
      const transaction = createCreditCardPaymentTransaction(
        1, 150, '2023-10-27', 'user_1', 'CC Payment', null, 11
      );
      expect(transaction.amount).toBe(150);
      expect(transaction.type).toBe('payment');
      expect(transaction.accountId).toBe(1);
    });
  });

  describe('excludeTransfersAndPayments', () => {
    it('should return true for non-transfer/payment transactions', () => {
      const transaction = { type: 'transaction' } as Transaction;
      expect(excludeTransfersAndPayments(transaction)).toBe(true);
    });

    it('should return false for transfer transactions', () => {
      const transaction = { type: 'transfer' } as Transaction;
      expect(excludeTransfersAndPayments(transaction)).toBe(false);
    });

    it('should return false for payment transactions', () => {
      const transaction = { type: 'payment' } as Transaction;
      expect(excludeTransfersAndPayments(transaction)).toBe(false);
    });
  });

  describe('isCreditCard', () => {
    it('should return true if the account type_id is 2 (credit_card)', () => {
      const account = { type_id: 2 } as Account;
      expect(isCreditCard(account)).toBe(true);
    });

    it('should return false if the account type_id is not 2', () => {
      const account = { type_id: 1 } as Account;
      expect(isCreditCard(account)).toBe(false);
    });

    it('should return true if the account has loaded type relation with credit_card', () => {
      const account = { 
        type_id: 2, 
        type: { id: 2, name: 'credit_card', description: 'Credit Card', createdAt: new Date() }
      } as Account;
      expect(isCreditCard(account)).toBe(true);
    });

    it('should return false if the account has loaded type relation with checking', () => {
      const account = { 
        type_id: 1, 
        type: { id: 1, name: 'checking', description: 'Checking', createdAt: new Date() }
      } as Account;
      expect(isCreditCard(account)).toBe(false);
    });
  });

  describe('generatePaymentPayeeName', () => {
    const mockAccount: Account = {
      id: 1,
      name: 'Chase Visa',
      type_id: 2,
      userId: 'user_1',
      isActive: true,
      initialBalance: 0,
      balance: -500,
      availableCredit: null,
      creditLimit: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01')
    };

    it('should generate "Payment to" payee name', () => {
      const payeeName = generatePaymentPayeeName(mockAccount, 'to');
      expect(payeeName).toBe('Payment to Chase Visa');
    });

    it('should generate "Payment from" payee name', () => {
      const payeeName = generatePaymentPayeeName(mockAccount, 'from');
      expect(payeeName).toBe('Payment from Chase Visa');
    });
  });

  describe('parsePaymentPayee', () => {
    it('should parse "Payment to" format correctly', () => {
      const result = parsePaymentPayee('Payment to Chase Visa');
      expect(result).toEqual({
        isPayment: true,
        direction: 'to'
      });
    });

    it('should parse "Payment from" format correctly', () => {
      const result = parsePaymentPayee('Payment from Checking Account');
      expect(result).toEqual({
        isPayment: true,
        direction: 'from'
      });
    });

    it('should return isPayment false for non-payment payee', () => {
      const result = parsePaymentPayee('Grocery Store');
      expect(result).toEqual({
        isPayment: false
      });
    });

    it('should return isPayment false for empty string', () => {
      const result = parsePaymentPayee('');
      expect(result).toEqual({
        isPayment: false
      });
    });

    it('should return isPayment false for null/undefined', () => {
      const result = parsePaymentPayee(null as any);
      expect(result).toEqual({
        isPayment: false
      });
    });

    it('should handle complex account names', () => {
      const result = parsePaymentPayee('Payment to My Credit Card with Spaces');
      expect(result).toEqual({
        isPayment: true,
        direction: 'to'
      });
    });
  });

});

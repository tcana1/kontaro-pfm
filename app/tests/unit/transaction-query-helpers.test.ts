import { describe, it, expect } from 'vitest';
import { buildSearchConditions, resolveColumnName, transformRow } from '../../client/src/services/transaction-query-helpers';

describe('buildSearchConditions', () => {
  describe('text conditions', () => {
    it('always includes 6 unaccented ilike conditions', () => {
      const result = buildSearchConditions('cafe', 'USD');
      const textConditions = result.filter(c => c.includes('ilike'));
      expect(textConditions).toHaveLength(6);
      expect(textConditions[0]).toBe('payee_unaccented.ilike.%cafe%');
      expect(textConditions[1]).toBe('observation_unaccented.ilike.%cafe%');
    });

    it('strips accents from search term', () => {
      const result = buildSearchConditions('Verão', 'USD');
      expect(result[0]).toBe('payee_unaccented.ilike.%Verao%');
    });

    it('encodes PostgREST special chars: percent in term becomes %25', () => {
      const result = buildSearchConditions('50%', 'USD');
      // The % in the search term is encoded; the surrounding % in ilike pattern are not
      expect(result[0]).toBe('payee_unaccented.ilike.%50%25%');
    });

    it('encodes PostgREST special chars: comma and parens', () => {
      const result = buildSearchConditions('a,b(c)', 'USD');
      expect(result[0]).toBe('payee_unaccented.ilike.%a%2Cb%28c%29%');
    });
  });

  describe('numeric conditions (USD)', () => {
    it('non-numeric term produces no amount conditions', () => {
      const result = buildSearchConditions('cafe', 'USD');
      expect(result.filter(c => c.startsWith('and('))).toHaveLength(0);
    });

    it('whole number → tolerance 1', () => {
      const result = buildSearchConditions('30', 'USD');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds).toHaveLength(4);
      expect(amountConds[0]).toBe('and(amount.gte.29,amount.lte.31)');
      expect(amountConds[1]).toBe('and(amount.gte.-31,amount.lte.-29)');
    });

    it('one decimal place → tolerance 0.1', () => {
      const result = buildSearchConditions('29.9', 'USD');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds[0]).toBe('and(amount.gte.29.8,amount.lte.30)');
    });

    it('two decimal places → tolerance 0.001', () => {
      const result = buildSearchConditions('29.95', 'USD');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds[0]).toBe('and(amount.gte.29.949,amount.lte.29.951)');
    });

    it('covers both amount and transaction_amount fields', () => {
      const result = buildSearchConditions('10', 'USD');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds.some(c => c.includes('transaction_amount'))).toBe(true);
    });
  });

  describe('numeric conditions (BRL — comma as decimal)', () => {
    it('whole number in BRL → tolerance 1', () => {
      const result = buildSearchConditions('30', 'BRL');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds[0]).toBe('and(amount.gte.29,amount.lte.31)');
    });

    it('comma decimal in BRL → tolerance 0.001', () => {
      const result = buildSearchConditions('29,95', 'BRL');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds[0]).toBe('and(amount.gte.29.949,amount.lte.29.951)');
    });

    it('one comma decimal place in BRL → tolerance 0.1', () => {
      const result = buildSearchConditions('29,9', 'BRL');
      const amountConds = result.filter(c => c.startsWith('and('));
      expect(amountConds[0]).toBe('and(amount.gte.29.8,amount.lte.30)');
    });
  });
});

describe('resolveColumnName', () => {
  it('maps categories.name → category_name', () => {
    expect(resolveColumnName('categories.name')).toBe('category_name');
  });

  it('maps notes → observation', () => {
    expect(resolveColumnName('notes')).toBe('observation');
  });

  it('maps amount → transaction_amount so multi-split transactions sort by their displayed total', () => {
    expect(resolveColumnName('amount')).toBe('transaction_amount');
  });

  it('passes through other column names unchanged', () => {
    expect(resolveColumnName('payment_date')).toBe('payment_date');
    expect(resolveColumnName('payee')).toBe('payee');
  });
});

describe('transformRow', () => {
  it('maps transaction_id to id', () => {
    const row = { transaction_id: 42, amount: '10.5', observation: null };
    expect(transformRow(row).id).toBe(42);
  });

  it('converts amount to string via Number()', () => {
    const row = { transaction_id: 1, amount: 10.5, observation: null };
    expect(transformRow(row).amount).toBe('10.5');
  });

  it('maps observation to notes', () => {
    const row = { transaction_id: 1, amount: '0', observation: 'test note' };
    expect(transformRow(row).notes).toBe('test note');
  });

  it('falls back to Uncategorized when category_name is null', () => {
    const row = { transaction_id: 1, amount: '0', observation: null, category_name: null };
    expect(transformRow(row).category_name).toBe('Uncategorized');
  });

  it('keeps existing category_name', () => {
    const row = { transaction_id: 1, amount: '0', observation: null, category_name: 'Food' };
    expect(transformRow(row).category_name).toBe('Food');
  });

  it('falls back to Unknown Account when account_name is missing', () => {
    const row = { transaction_id: 1, amount: '0', observation: null };
    expect(transformRow(row).account_name).toBe('Unknown Account');
  });

  it('falls back to empty string for category_group_emoji', () => {
    const row = { transaction_id: 1, amount: '0', observation: null };
    expect(transformRow(row).category_group_emoji).toBe('');
  });

  it('sets split_observation from observation', () => {
    const row = { transaction_id: 1, amount: '0', observation: 'obs' };
    expect(transformRow(row).split_observation).toBe('obs');
  });

  it('sets split_observation to empty string when observation is null', () => {
    const row = { transaction_id: 1, amount: '0', observation: null };
    expect(transformRow(row).split_observation).toBe('');
  });

  it('preserves all other fields from the original row', () => {
    const row = { transaction_id: 1, amount: '0', observation: null, payee: 'ACME', tag_id: 5 };
    const result = transformRow(row);
    expect(result.payee).toBe('ACME');
    expect(result.tag_id).toBe(5);
  });
});

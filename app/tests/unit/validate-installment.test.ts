import { describe, it, expect } from 'vitest';
import { validateInstallment } from '../../client/src/utils/transaction-utils';

describe('validateInstallment', () => {
  it('accepts current <= total', () => {
    expect(validateInstallment('1/3')).toBeNull();
    expect(validateInstallment('3/3')).toBeNull();
    expect(validateInstallment('01/12')).toBeNull();
    expect(validateInstallment(' 2 / 5 ')).toBeNull();
  });

  it('rejects current greater than total', () => {
    expect(validateInstallment('4/3')).toBe('range');
  });

  it('rejects zero values', () => {
    expect(validateInstallment('0/3')).toBe('range');
    expect(validateInstallment('1/0')).toBe('range');
  });

  it('rejects malformed values', () => {
    for (const v of ['abc', '1', '1/', '/3', '1/2/3', '1.5/3', '-1/3', '1/x']) {
      expect(validateInstallment(v)).toBe('format');
    }
  });
});

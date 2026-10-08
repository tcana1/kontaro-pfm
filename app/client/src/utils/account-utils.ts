import type { Account } from '@shared/schema';

/**
 * Get the account type name from an account object
 * Works with both loaded type relations and direct typeId lookup
 */
export function getAccountTypeName(account: Account): string {
  // Fall back to mapping type_id to type name
  switch (account.type_id) {
    case 1:
      return 'checking';
    case 2:
      return 'credit_card';
    case 3:
      return 'tracking';
    case 4:
      return 'savings';
    default:
      return 'checking';
  }
}

/**
 * Get a display-friendly version of the account type name
 */
export function getAccountTypeDisplayName(account: Account): string {
  const typeName = getAccountTypeName(account);
  
  switch (typeName) {
    case 'credit_card':
      return 'Credit Card';
    case 'checking':
      return 'Checking';
    case 'tracking':
      return 'Tracking';
    case 'savings':
      return 'Savings';
    default:
      return typeName.charAt(0).toUpperCase() + typeName.slice(1);
  }
}


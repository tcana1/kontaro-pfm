// Mock data for tests
import { Account, AccountType, Category, CategoryGroup, Transaction, Settings, User } from '@shared/schema';
import { vi } from 'vitest';

// Mock User
export const mockUser: User = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hashedpassword',
  firstName: 'Test',
  lastName: 'User',
  createdAt: new Date('2023-01-01'),
};

// Mock Settings
export const mockSettings: Settings = {
  id: 1,
  user_id: 1,
  currency: 'USD',
  locale: 'en-US',
  theme: 'light',
  dateFormat: 'MM/DD/YYYY',
};

// Mock Category Groups
export const mockCategoryGroups: CategoryGroup[] = [
  {
    id: 1,
    name: 'Housing',
    user_id: 1,
    description: 'Housing related expenses',
    isActive: true,
    color: '#FF5733',
  },
  {
    id: 2,
    name: 'Food',
    user_id: 1,
    description: 'Food and dining',
    isActive: true,
    color: '#33FF57',
  },
  {
    id: 3,
    name: 'Income',
    user_id: 1,
    description: 'Income sources',
    isActive: true,
    color: '#3357FF',
  },
];

// Mock Categories
export const mockCategories: Category[] = [
  {
    id: 1,
    name: 'Rent/Mortgage',
    color: '#9370DB',
    groupId: 1,
    user_id: 1,
    isIncome: false,
    isActive: true,
  },
  {
    id: 2,
    name: 'Groceries',
    color: '#3CB371',
    groupId: 2,
    user_id: 1,
    isIncome: false,
    isActive: true,
  },
  {
    id: 3,
    name: 'Salary',
    color: '#1E90FF',
    groupId: 3,
    user_id: 1,
    isIncome: true,
    isActive: true,
  },
  {
    id: 4,
    name: 'Utilities',
    color: '#FF6347',
    groupId: 1,
    user_id: 1,
    isIncome: false,
    isActive: true,
  },
];

// Mock Account Types
export const mockAccountTypes: AccountType[] = [
  {
    id: 1,
    name: 'checking',
    description: 'Standard checking account for daily transactions',
    createdAt: new Date(),
  },
  {
    id: 2,
    name: 'credit_card',
    description: 'Credit card account for credit-based purchases',
    createdAt: new Date(),
  },
  {
    id: 3,
    name: 'tracking',
    description: 'Tracking account for monitoring external balances',
    createdAt: new Date(),
  },
];

// Mock Accounts
export const mockAccounts: Account[] = [
  {
    id: 1,
    name: 'Chase Checking',
    type_id: 1, // checking
    starting_balance: '5000.50',
    isActive: true,
    user_id: 'test-user-id',
    icon: 'ri-bank-line',
    last4: null,
    createdAt: new Date(),
  },
  {
    id: 2,
    name: 'Visa Card',
    type_id: 2, // credit_card
    starting_balance: '-1250.75',
    isActive: true,
    user_id: 'test-user-id',
    icon: 'ri-bank-line',
    last4: '1234',
    createdAt: new Date(),
  },
  {
    id: 3,
    name: 'Savings Account',
    type_id: 1, // checking (for simplicity)
    starting_balance: '10000.00',
    isActive: true,
    user_id: 'test-user-id',
    icon: 'ri-bank-line',
    last4: null,
    createdAt: new Date(),
  },
];

// Mock Transactions
//
// These mirror rows from the `v_transaction_splits` DB view — the shape the UI
// actually consumes: one row per split, with transaction fields flattened
// alongside split/category/account fields. Multi-split transactions appear as
// multiple rows sharing the same `id` (see id 5 below), which the table groups
// back into a single GroupedTransaction. Fields follow the current snake_case
// schema: dates are 'YYYY-MM-DD' strings, amounts are decimal strings.
const TEST_USER_ID = 'test-user-id';

export interface MockTransactionRow {
  id: number;
  user_id: string;
  type: string;
  account_id: number;
  account_name: string;
  payment_date: string;
  purchase_date: string;
  payee: string;
  amount: string;
  notes: string | null;
  unique_hash: string;
  is_installment: boolean;
  installment_number: number | null;
  installment_total: number | null;
  to_account_id: number | null;
  to_account_name: string | null;
  is_ignored: boolean;
  is_reconciled: boolean;
  status: { id: number; name: string };
  status_id: number;
  status_name: string;
  tag_id: number | null;
  tag_name: string | null;
  tag_color: string | null;
  // Split/category fields (from the joined split row)
  split_id: number;
  split_amount: number;
  split_observation: string | null;
  category_id: number | null;
  category_name: string;
  category_is_income: boolean;
  category_group_name: string;
  category_group_emoji: string;
  is_income: boolean;
}

export const mockTransactions: MockTransactionRow[] = [
  {
    id: 1,
    user_id: TEST_USER_ID,
    type: 'transaction',
    account_id: 1,
    account_name: 'Chase Checking',
    payment_date: '2023-04-01',
    purchase_date: '2023-04-01',
    payee: 'Landlord',
    amount: '-1500.00',
    notes: 'April rent payment',
    unique_hash: 'hash-tx-1',
    is_installment: false,
    installment_number: null,
    installment_total: null,
    to_account_id: null,
    to_account_name: null,
    is_ignored: false,
    is_reconciled: false,
    status: { id: 1, name: 'Pending' },
    status_id: 1,
    status_name: 'Pending',
    tag_id: null,
    tag_name: null,
    tag_color: null,
    split_id: 101,
    split_amount: -1500.0,
    split_observation: 'April rent payment',
    category_id: 1,
    category_name: 'Rent/Mortgage',
    category_is_income: false,
    category_group_name: 'Housing',
    category_group_emoji: '🏠',
    is_income: false,
  },
  {
    id: 2,
    user_id: TEST_USER_ID,
    type: 'transaction',
    account_id: 1,
    account_name: 'Chase Checking',
    payment_date: '2023-04-05',
    purchase_date: '2023-04-05',
    payee: 'Whole Foods',
    amount: '-125.50',
    notes: 'Weekly groceries',
    unique_hash: 'hash-tx-2',
    is_installment: false,
    installment_number: null,
    installment_total: null,
    to_account_id: null,
    to_account_name: null,
    is_ignored: false,
    is_reconciled: true,
    status: { id: 2, name: 'Cleared' },
    status_id: 2,
    status_name: 'Cleared',
    tag_id: null,
    tag_name: null,
    tag_color: null,
    split_id: 102,
    split_amount: -125.5,
    split_observation: 'Weekly groceries',
    category_id: 2,
    category_name: 'Groceries',
    category_is_income: false,
    category_group_name: 'Food',
    category_group_emoji: '🍔',
    is_income: false,
  },
  {
    id: 3,
    user_id: TEST_USER_ID,
    type: 'transaction',
    account_id: 1,
    account_name: 'Chase Checking',
    payment_date: '2023-04-15',
    purchase_date: '2023-04-15',
    payee: 'ABC Corp',
    amount: '4500.00',
    notes: 'April salary',
    unique_hash: 'hash-tx-3',
    is_installment: false,
    installment_number: null,
    installment_total: null,
    to_account_id: null,
    to_account_name: null,
    is_ignored: false,
    is_reconciled: false,
    status: { id: 2, name: 'Cleared' },
    status_id: 2,
    status_name: 'Cleared',
    tag_id: null,
    tag_name: null,
    tag_color: null,
    split_id: 103,
    split_amount: 4500.0,
    split_observation: 'April salary',
    category_id: 3,
    category_name: 'Salary',
    category_is_income: true,
    category_group_name: 'Income',
    category_group_emoji: '💰',
    is_income: true,
  },
  {
    id: 4,
    user_id: TEST_USER_ID,
    type: 'transfer',
    account_id: 1,
    account_name: 'Chase Checking',
    payment_date: '2023-04-16',
    purchase_date: '2023-04-16',
    payee: 'Transfer to Savings',
    amount: '-1000.00',
    notes: 'Monthly savings',
    unique_hash: 'hash-tx-4',
    is_installment: false,
    installment_number: null,
    installment_total: null,
    to_account_id: 3,
    to_account_name: 'Savings Account',
    is_ignored: false,
    is_reconciled: false,
    status: { id: 2, name: 'Cleared' },
    status_id: 2,
    status_name: 'Cleared',
    tag_id: null,
    tag_name: null,
    tag_color: null,
    split_id: 104,
    split_amount: -1000.0,
    split_observation: null,
    category_id: null,
    category_name: '',
    category_is_income: false,
    category_group_name: '',
    category_group_emoji: '',
    is_income: false,
  },
  // Transaction 5 spans two splits → two rows sharing id 5, exercising grouping.
  {
    id: 5,
    user_id: TEST_USER_ID,
    type: 'transaction',
    account_id: 1,
    account_name: 'Chase Checking',
    payment_date: '2023-04-10',
    purchase_date: '2023-04-10',
    payee: 'Costco',
    amount: '-150.00',
    notes: null,
    unique_hash: 'hash-tx-5',
    is_installment: false,
    installment_number: null,
    installment_total: null,
    to_account_id: null,
    to_account_name: null,
    is_ignored: false,
    is_reconciled: false,
    status: { id: 1, name: 'Pending' },
    status_id: 1,
    status_name: 'Pending',
    tag_id: null,
    tag_name: null,
    tag_color: null,
    split_id: 105,
    split_amount: -150.0,
    split_observation: 'Groceries portion',
    category_id: 2,
    category_name: 'Groceries',
    category_is_income: false,
    category_group_name: 'Food',
    category_group_emoji: '🍔',
    is_income: false,
  },
  {
    id: 5,
    user_id: TEST_USER_ID,
    type: 'transaction',
    account_id: 1,
    account_name: 'Chase Checking',
    payment_date: '2023-04-10',
    purchase_date: '2023-04-10',
    payee: 'Costco',
    amount: '-50.00',
    notes: null,
    unique_hash: 'hash-tx-5',
    is_installment: false,
    installment_number: null,
    installment_total: null,
    to_account_id: null,
    to_account_name: null,
    is_ignored: false,
    is_reconciled: false,
    status: { id: 1, name: 'Pending' },
    status_id: 1,
    status_name: 'Pending',
    tag_id: null,
    tag_name: null,
    tag_color: null,
    split_id: 106,
    split_amount: -50.0,
    split_observation: 'Utilities portion',
    category_id: 4,
    category_name: 'Utilities',
    category_is_income: false,
    category_group_name: 'Housing',
    category_group_emoji: '🏠',
    is_income: false,
  },
];

// Default mock context data for testing components
export const mockContextData = {
  user: mockUser,
  accounts: mockAccounts,
  accountTypes: mockAccountTypes,
  categories: mockCategories,
  categoryGroups: mockCategoryGroups,
  settings: mockSettings,
  isLoading: false,
  error: null,
  currency: 'USD' as const,
  setCurrency: vi.fn(),
  theme: 'light' as const,
  setTheme: vi.fn(),
  locale: 'en-US',
  setLocale: vi.fn(),
  dateFormat: 'MM/DD/YYYY',
  setDateFormat: vi.fn(),
};
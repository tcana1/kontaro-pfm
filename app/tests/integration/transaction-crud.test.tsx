import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FinanceProvider } from '../../client/src/contexts/finance-context';
import { HistoryProvider } from '../../client/src/contexts/history-context';
import TransactionsPageContent from '../../client/src/pages/transactions-page';
import { mockAccounts, mockCategories, mockCategoryGroups, mockSettings, mockTransactions } from '../mocks/mock-data';
import { Toaster } from '../../client/src/components/ui/toaster';

vi.mock('../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [] }),
}));

vi.mock('../../client/src/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 1, email: 'test@example.com' } }),
}));

vi.mock('../../client/src/contexts/finance-context', () => ({
  useFinance: () => ({
    currency: 'USD',
    accounts: mockAccounts,
    categories: mockCategories,
    categoryGroups: mockCategoryGroups,
    locale: 'en-US',
    dateFormat: 'MM/DD/YYYY',
  }),
  FinanceProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../client/src/services/supabase-service', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    supabaseService: {
      ...actual.supabaseService,
      createUniqueTransaction: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(() => Promise.resolve({ data: null, error: null })),
      getPendingMatchCandidates: vi.fn(() => Promise.resolve([])),
    },
  };
});

vi.mock('../../client/src/hooks/useServiceQuery', () => ({
  useServiceQuery: vi.fn((key) => {
    if (Array.isArray(key) ? key[0] === 'transactions' : key === 'transactions') {
      return { data: { data: mockTransactions, count: mockTransactions.length }, isLoading: false, isError: false, error: null, refetch: vi.fn() };
    }
    if (Array.isArray(key) ? key[0] === 'accounts' : key === 'accounts') {
      return { data: mockAccounts, isLoading: false, isError: false, error: null, refetch: vi.fn() };
    }
    if (Array.isArray(key) ? key[0] === 'categories' : key === 'categories') {
      return { data: mockCategories, isLoading: false, isError: false, error: null, refetch: vi.fn() };
    }
    if (Array.isArray(key) ? key[0] === 'categoryGroups' : key === 'categoryGroups') {
      return { data: mockCategoryGroups, isLoading: false, isError: false, error: null, refetch: vi.fn() };
    }
    if (Array.isArray(key) ? key[0] === 'tags' : key === 'tags') {
      return { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
    }
    return { data: { data: [], count: 0 }, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  }),
}));

const server = setupServer(
  http.get('/api/categories', () => HttpResponse.json(mockCategories)),
  http.get('/api/accounts', () => HttpResponse.json(mockAccounts)),
  http.get('/api/settings', () => HttpResponse.json(mockSettings)),
  http.get('/api/transactions', () => HttpResponse.json(mockTransactions)),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FinanceProvider>
        <HistoryProvider>
          {ui}
          <Toaster />
        </HistoryProvider>
      </FinanceProvider>
    </QueryClientProvider>
  );
};

describe('Transactions page — UI smoke tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the page with Add Transaction button', async () => {
    renderWithProviders(<TransactionsPageContent />);
    await waitFor(() => {
      expect(screen.getByText('Transaction')).toBeInTheDocument();
    });
  });

  it('shows inline form when Add Transaction is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TransactionsPageContent />);

    await waitFor(() => expect(screen.getByText('Transaction')).toBeInTheDocument());
    await user.click(screen.getByText('Transaction'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Additional notes...')).toBeInTheDocument();
    });
  });
});

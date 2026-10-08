/**
 * Error state smoke tests for the transactions page.
 * Verifies the component renders gracefully (no crash) when data fetches fail.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FinanceProvider } from '../../client/src/contexts/finance-context';
import { HistoryProvider } from '../../client/src/contexts/history-context';
import TransactionsPageContent from '../../client/src/pages/transactions-page';
import { mockAccounts, mockCategories, mockCategoryGroups, mockSettings } from '../mocks/mock-data';
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

const server = setupServer(
  http.get('/api/categories', () => HttpResponse.json(mockCategories)),
  http.get('/api/accounts', () => HttpResponse.json(mockAccounts)),
  http.get('/api/settings', () => HttpResponse.json(mockSettings)),
  http.get('/api/transactions', () => new HttpResponse(null, { status: 500 })),
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

describe('Transactions page — error states', () => {
  it('renders without crashing when transactions fetch returns an error', async () => {
    vi.mock('../../client/src/hooks/useServiceQuery', () => ({
      useServiceQuery: vi.fn((key) => {
        const k = Array.isArray(key) ? key[0] : key;
        if (k === 'transactions') {
          return { data: null, isLoading: false, isError: true, error: new Error('Network error'), refetch: vi.fn() };
        }
        if (k === 'accounts') return { data: mockAccounts, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        if (k === 'categories') return { data: mockCategories, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        if (k === 'categoryGroups') return { data: mockCategoryGroups, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        if (k === 'tags') return { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
        return { data: null, isLoading: false, isError: false, error: null, refetch: vi.fn() };
      }),
    }));

    renderWithProviders(<TransactionsPageContent />);

    // Page must not crash; toolbar with Add Transaction button should still be present
    await waitFor(() => {
      expect(screen.getByText('Transaction')).toBeInTheDocument();
    });
  });

  it('renders without crashing when page is in loading state', async () => {
    vi.mock('../../client/src/hooks/useServiceQuery', () => ({
      useServiceQuery: vi.fn((key) => {
        const k = Array.isArray(key) ? key[0] : key;
        if (k === 'transactions') {
          return { data: null, isLoading: true, isError: false, error: null, refetch: vi.fn() };
        }
        if (k === 'accounts') return { data: mockAccounts, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        if (k === 'categories') return { data: mockCategories, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        if (k === 'categoryGroups') return { data: mockCategoryGroups, isLoading: false, isError: false, error: null, refetch: vi.fn() };
        if (k === 'tags') return { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
        return { data: null, isLoading: false, isError: false, error: null, refetch: vi.fn() };
      }),
    }));

    renderWithProviders(<TransactionsPageContent />);

    await waitFor(() => {
      expect(screen.getByText('Transaction')).toBeInTheDocument();
    });
  });
});

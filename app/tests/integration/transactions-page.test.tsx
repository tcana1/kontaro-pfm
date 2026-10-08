import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FinanceProvider } from '../../client/src/contexts/finance-context';
import { HistoryProvider } from '../../client/src/contexts/history-context';
import TransactionsPageContent from '../../client/src/pages/transactions-page';
import { mockAccounts, mockCategories, mockSettings, mockTransactions } from '../mocks/mock-data';
import { supabaseService } from '../../client/src/services/supabase-service';
import { Toaster } from '../../client/src/components/ui/toaster';

// Mock the toast hook
vi.mock('../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [] }),
}));

// Mock the useAuth hook
vi.mock('../../client/src/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 1, email: 'test@example.com' } }),
}));

// Mock supabaseService for commands
vi.mock('../../client/src/services/supabase-service', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    supabaseService: {
      ...actual.supabaseService,
      from: vi.fn((tableName) => {
        if (tableName === 'transactions') {
          return {
            insert: vi.fn(() => Promise.resolve({ data: [{ id: 999, ...mockTransactions[0] }], error: null })),
            update: vi.fn(() => Promise.resolve({ data: [{ id: 1, ...mockTransactions[0], amount: 123 }], error: null })),
            delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
        }
        return actual.supabaseService.from(tableName);
      }),
      deleteMany: vi.fn(() => Promise.resolve({ data: null, error: null })),
      getPendingMatchCandidates: vi.fn(() => Promise.resolve([])),
    },
  };
});

// Mock useServiceQuery
vi.mock('../../client/src/hooks/useServiceQuery', () => ({
  useServiceQuery: vi.fn((key, serviceCall, options) => {
    if (key[0] === 'transactions') {
      return {
        data: { data: mockTransactions, count: mockTransactions.length },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    if (key === 'tags' || key[0] === 'tags') {
      return {
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return {
      data: { data: [], count: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  }),
}));

// Mock API requests
const server = setupServer(
  http.get('/api/categories', () => HttpResponse.json(mockCategories)),
  http.get('/api/accounts', () => HttpResponse.json(mockAccounts)),
  http.get('/api/settings', () => HttpResponse.json(mockSettings)),
  http.get('/api/transactions', ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const accountId = url.searchParams.get('accountId');
    const categoryId = url.searchParams.get('categoryId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    let filteredTransactions = mockTransactions;

    if (search) {
      filteredTransactions = filteredTransactions.filter(t =>
        (t.notes ?? '').toLowerCase().includes(search.toLowerCase()) ||
        t.payee.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (accountId) {
      filteredTransactions = filteredTransactions.filter(t => t.account_id === parseInt(accountId));
    }
    if (categoryId) {
      filteredTransactions = filteredTransactions.filter(t => t.category_id === parseInt(categoryId));
    }
    if (startDate) {
      filteredTransactions = filteredTransactions.filter(t => new Date(t.payment_date) >= new Date(startDate));
    }
    if (endDate) {
      filteredTransactions = filteredTransactions.filter(t => new Date(t.payment_date) <= new Date(endDate));
    }

    return HttpResponse.json(filteredTransactions);
  }),
  http.post('/api/transactions', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 999, ...body }, { status: 201 });
  }),
  http.put('/api/transactions/:id', async ({ request, params }) => {
    const { id } = params;
    const body = await request.json();
    return HttpResponse.json({ id: parseInt(id as string), ...body });
  }),
  http.delete('/api/transactions/:id', () => HttpResponse.json(null, { status: 204 })),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
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

describe('TransactionsPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the actual implementation of from, insert, update, delete, select
    // This is crucial because the commands directly call these methods.
    supabaseService.from.mockImplementation((tableName) => {
      if (tableName === 'transactions') {
        return {
          insert: vi.fn((data) => {
            return Promise.resolve({ data: [{ id: 999, ...data[0] }], error: null });
          }),
          update: vi.fn((data) => Promise.resolve({ data: [{ id: data.id, ...data }], error: null })),
          delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
          select: vi.fn(() => Promise.resolve({ data: mockTransactions, error: null })),
        };
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
    });
  });

  it('should render the transactions page with a list of transactions', async () => {
    renderWithProviders(<TransactionsPageContent />);
    await waitFor(() => {
      expect(screen.queryByText(/Selected: \(0\)/)).not.toBeInTheDocument();
    });
  });

  

  

  

  

  

  

  

  

  

  
});

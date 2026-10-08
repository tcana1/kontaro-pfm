import { render as rtlRender } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinanceProvider } from '../client/src/contexts/finance-context';
import React from 'react';

// Default mock data for context
const defaultContextData = {
  accounts: [],
  categories: [],
  categoryGroups: [],
  user: null,
  settings: null,
  isLoading: false,
  error: null,
};

// Create a custom render function that includes providers
function render(
  ui,
  {
    contextValue = defaultContextData,
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    }),
    ...renderOptions
  } = {}
) {
  const AllProviders = ({ children }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <FinanceProvider>
          {children}
        </FinanceProvider>
      </QueryClientProvider>
    );
  };

  return {
    user: userEvent.setup(),
    ...rtlRender(ui, {
      wrapper: AllProviders,
      ...renderOptions,
    }),
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override the render method
export { render };
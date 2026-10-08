# Testing Documentation

This directory contains the testing infrastructure for the Personal Finance Management application. We use Vitest as our test runner along with Testing Library for component testing.

## Directory Structure

- `tests/unit/`: Contains unit tests for utility functions and simple components
- `tests/integration/`: Contains integration tests for components that interact with each other
- `tests/mocks/`: Contains mock data and API handlers for testing
- `tests/setup.ts`: Global test setup file for configuring the test environment

## Running Tests

We've provided a convenient test script that can be used to run tests in different modes:

To run all tests:

```bash
./run-tests.sh
```

To run tests in watch mode:

```bash
./run-tests.sh watch
```

To run tests with coverage:

```bash
./run-tests.sh coverage
```

To run a specific test file or directory:

```bash
./run-tests.sh tests/unit/date-utils.test.ts
```

## Test Setup

The global test setup is defined in `tests/setup.ts`. It:

1. Configures custom matchers for Testing Library
2. Sets up cleanup after each test
3. Mocks browser APIs that might not be available in the test environment, including:
   - ResizeObserver
   - matchMedia

## Mock API Requests

API requests are mocked using Mock Service Worker (MSW). The mock handlers are defined in `tests/mocks/api-handlers.ts`.

## Mock Data

Mock data for testing is defined in `tests/mocks/mock-data.ts`. This includes:
- Mock accounts
- Mock categories
- Mock transactions
- Mock settings

## Best Practices

1. **Test Organization**: Group related tests with `describe` and use clear test descriptions with `it` or `test`.
2. **Test Independence**: Each test should be independent and not rely on the state from other tests.
3. **Arrange-Act-Assert**: Structure tests with clear arrangement, action, and assertion phases.
4. **Use Testing Library Queries**: Prefer `getByRole`, `getByTestId`, etc. over direct DOM selection.
5. **Integration with Backend**: Use MSW to mock API requests rather than stubbing fetch/axios directly.
6. **Test Both Success and Error Cases**: Ensure that error handling is properly tested.

## Example Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { formatDateForDisplay } from '../../client/src/lib/date-utils';

describe('Date Utils', () => {
  describe('formatDateForDisplay', () => {
    it('should format date using default format', () => {
      const date = new Date('2023-04-15');
      const formattedDate = formatDateForDisplay(date);
      expect(formattedDate).toContain('Apr');
      expect(formattedDate).toContain('15');
      expect(formattedDate).toContain('2023');
    });
  });
});
```

### Integration Test Example

```typescript
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionForm } from '../../client/src/components/transactions/transaction-form';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

describe('TransactionForm', () => {
  it('renders the form with all required fields', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TransactionForm onSuccess={() => {}} onCancel={() => {}} />
      </QueryClientProvider>
    );
    
    expect(screen.getByTestId('form-field-date')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-amount')).toBeInTheDocument();
    // ... other assertions
  });
});
```
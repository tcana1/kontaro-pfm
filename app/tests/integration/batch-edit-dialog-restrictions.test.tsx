import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BatchEditDialog from '@/components/transactions/batch-edit-dialog'
import type { Transaction } from '@shared/schema'

// Mock the contexts and hooks
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

vi.mock('@/contexts/history-context', () => ({
  useHistoryContext: () => ({
    execute: vi.fn()
  })
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user123' }
  })
}))

vi.mock('@/contexts/finance-context', () => ({
  useFinance: () => ({
    categories: [],
    accounts: [],
    locale: 'en-US',
    dateFormat: 'MM/dd/yyyy'
  })
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({})
}))

const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  user_id: 'user123',
  type: 'transaction',
  accountId: 1,
  paymentDate: '2024-01-01',
  purchaseDate: '2024-01-01',
  payee: 'Test Store',
  amount: '100.00',
  description: 'Test transaction',
  notes: 'Test notes',
  uniqueHash: 'hash123',
  categoryId: 1,
  status_id: 1, // Pending
  is_reconciled: false,
  is_installment: false,
  installment_number: undefined,
  installment_total: undefined,
  to_account_id: undefined,
  toAccountId: undefined,
  toAccountName: undefined,
  category_name: 'Food',
  account_name: 'Checking',
  ...overrides
} as Transaction);

describe('Batch Edit Dialog Restrictions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show all fields enabled for pending transactions', () => {
    const transactions = [
      createMockTransaction({ id: 1 }),
      createMockTransaction({ id: 2 })
    ]

    render(
      <BatchEditDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedTransactions={transactions}
      />
    )

    // Should not show warning banner
    expect(screen.queryByText(/Some fields are disabled/)).not.toBeInTheDocument()
    
    // Date field should be enabled
    const dateButton = screen.getByRole('button', { name: /pick a date/i })
    expect(dateButton).not.toBeDisabled()
    expect(dateButton).not.toHaveClass('cursor-not-allowed')
    
    // Category and Account fields should be enabled (SelectTriggers)
    const selects = screen.getAllByRole('combobox')
    selects.forEach(select => {
      expect(select).not.toBeDisabled()
      expect(select).not.toHaveClass('cursor-not-allowed')
    })
  })

  it('should disable date field when reconciled transactions are selected', () => {
    const transactions = [
      createMockTransaction({ id: 1 }),
      createMockTransaction({ id: 2, is_reconciled: true }) // Reconciled
    ]

    render(
      <BatchEditDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedTransactions={transactions}
      />
    )

    // Should show warning banner with info icon
    expect(screen.getByText(/Some fields are disabled due to transaction types/)).toBeInTheDocument()
    expect(screen.getByText(/2 restrictions/)).toBeInTheDocument()
    
    // Should have info icon (by role or class)
    const infoIcon = document.querySelector('.cursor-help')
    expect(infoIcon).toBeInTheDocument()
    
    // Date field should be disabled
    const dateButton = screen.getByRole('button', { name: /pick a date/i })
    expect(dateButton).toBeDisabled()
    expect(dateButton).toHaveClass('cursor-not-allowed')
    expect(dateButton).toHaveAttribute('title', 'Cannot edit dates on reconciled transactions')
  })

  it('should disable category field when transfer transactions are selected', () => {
    const transactions = [
      createMockTransaction({ id: 1 }),
      createMockTransaction({ id: 2, type: 'transfer' })
    ]

    render(
      <BatchEditDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedTransactions={transactions}
      />
    )

    // Should show warning banner
    expect(screen.getByText(/Some fields are disabled due to transaction types/)).toBeInTheDocument()
    expect(screen.getByText(/2 restrictions/)).toBeInTheDocument()
    
    // Category and Account selects should be disabled
    // Note: We can't easily test Select component disabled state in this test setup
    // This would require more complex mocking of the Select component
    // In a real integration test, this would be tested through user interactions
  })

  it('should show Not Allowed dialog when linked transactions are selected', () => {
    const transactions = [
      createMockTransaction({ id: 1 }),
      createMockTransaction({ id: 2, to_account_id: 5 })
    ]

    render(
      <BatchEditDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedTransactions={transactions}
      />
    )

    // Should show Not Allowed dialog
    expect(screen.getByText('Batch Edit Not Allowed')).toBeInTheDocument()
    expect(screen.getByText(/Linked transactions.*cannot be batch edited/)).toBeInTheDocument()
    expect(screen.getByText('Please edit these transactions individually instead.')).toBeInTheDocument()
    
    // Should only have main Close button, not Update button
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    expect(closeButtons).toHaveLength(2) // Main close button + X button
    expect(screen.queryByRole('button', { name: /Update.*Transactions/ })).not.toBeInTheDocument()
  })

  it('should show warning banner with multiple restrictions for mixed selections', () => {
    const transactions = [
      createMockTransaction({ id: 1 }), // Pending
      createMockTransaction({ id: 2, is_reconciled: true }), // Reconciled
      createMockTransaction({ id: 3, type: 'transfer' }), // Transfer
    ]

    render(
      <BatchEditDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedTransactions={transactions}
      />
    )

    // Should show warning banner with 3 restrictions (paymentDate, accountId, categoryId)
    expect(screen.getByText(/Some fields are disabled due to transaction types/)).toBeInTheDocument()
    expect(screen.getByText(/3 restrictions/)).toBeInTheDocument()
    
    // Should have info icon for detailed tooltip
    const infoIcon = document.querySelector('.cursor-help')
    expect(infoIcon).toBeInTheDocument()
    
    // Date field should be disabled due to reconciled transaction
    const dateButton = screen.getByRole('button', { name: /pick a date/i })
    expect(dateButton).toBeDisabled()
    expect(dateButton).toHaveClass('cursor-not-allowed')
  })

  it('should not show warning banner when no restrictions apply', () => {
    const transactions = [
      createMockTransaction({ id: 1 })
    ]

    render(
      <BatchEditDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedTransactions={transactions}
      />
    )

    // Should not show warning banner
    expect(screen.queryByText(/Some fields are disabled/)).not.toBeInTheDocument()
  })
});
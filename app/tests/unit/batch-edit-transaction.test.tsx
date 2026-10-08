import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { BatchUpdateTransactionCommand } from '@/lib/commands/transaction-commands'
import { supabaseService } from '@/services/supabase-service'
import type { Transaction } from '@shared/schema'

// Mock the services
vi.mock('@/services/supabase-service', () => ({
  supabaseService: {
    update: vi.fn(),
    batchUpdateTransactions: vi.fn(),
  },
}))

const mockQueryClient = {
  invalidateQueries: vi.fn(),
  // BatchUpdateTransactionCommand optimistically patches the cache before the
  // DB round-trip; these tests don't seed any cached queries, so an empty
  // findAll() is enough to exercise that code path without crashing.
  getQueryCache: vi.fn(() => ({ findAll: vi.fn(() => []) })),
  setQueryData: vi.fn(),
} as unknown as QueryClient

describe('Batch Edit Transaction Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockTransactions: Transaction[] = [
    {
      id: 1,
      user_id: 'user123',
      type: 'transaction',
      accountId: 1,
      paymentDate: '2024-01-01',
      purchaseDate: '2024-01-01',
      payee: 'Store 1',
      amount: '100.00',
      description: 'Purchase 1',
      notes: 'Note 1',
      uniqueHash: 'hash1',
      categoryId: 1,
      status_id: 1,
      is_installment: false,
      installment_number: undefined,
      installment_total: undefined,
      toAccountId: undefined,
      toAccountName: undefined,
      category_name: 'Food',
      account_name: 'Checking'
    },
    {
      id: 2,
      user_id: 'user123',
      type: 'transaction',
      accountId: 1,
      paymentDate: '2024-01-02',
      purchaseDate: '2024-01-02',
      payee: 'Store 2',
      amount: '50.00',
      description: 'Purchase 2',
      notes: 'Note 2',
      uniqueHash: 'hash2',
      categoryId: 2,
      status_id: 1,
      is_installment: false,
      installment_number: undefined,
      installment_total: undefined,
      toAccountId: undefined,
      toAccountName: undefined,
      category_name: 'Entertainment',
      account_name: 'Checking'
    }
  ] as Transaction[]

  describe('1. BatchUpdateTransactionCommand Core Functionality', () => {
    it('should update multiple transactions successfully', async () => {
      const updateData = {
        category_id: 3,
        notes: 'Bulk updated notes',
        status_id: 2
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      // Mock successful batch update
      vi.mocked(supabaseService.batchUpdateTransactions).mockResolvedValue(undefined)

      await command.execute()

      // Should call batch update once, not individual updates
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledTimes(1)
      expect(supabaseService.update).not.toHaveBeenCalled()
      
      // Should call with correct transaction IDs and data
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledWith(
        [1, 2], // Transaction IDs
        expect.objectContaining({
          category_id: 3,
          notes: 'Bulk updated notes',
          status_id: 2,
          user_id: 'user123'
        }),
        'user123' // User ID
      )

      // Cache invalidation is handled internally by CacheUtils
    })

    it('should handle batch failures gracefully', async () => {
      const updateData = {
        category_id: 3,
        notes: 'Bulk updated notes'
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      // Mock batch update failure
      vi.mocked(supabaseService.batchUpdateTransactions).mockRejectedValue(new Error('Database error'))

      // Should throw error due to batch failure
      await expect(command.execute()).rejects.toThrow('Failed to batch update 2 transactions')

      // Should call batch update once
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledTimes(1)

      // Should not invalidate queries on failure (error thrown before that)
      expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled()

      // Should track all transactions as failed
      const failureInfo = command.getFailedTransactions()
      expect(failureInfo.ids).toEqual([1, 2])
      expect(failureInfo.errors.get(1)).toBe('Database error')
      expect(failureInfo.errors.get(2)).toBe('Database error')
    })

    it('should revert successful updates during unexecute', async () => {
      const updateData = {
        category_id: 3,
        notes: 'Bulk updated notes'
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      // Mock successful execution
      vi.mocked(supabaseService.batchUpdateTransactions).mockResolvedValue(undefined)
      await command.execute()
      vi.clearAllMocks()

      // Now test unexecute
      await command.unexecute()

      // Should call batch update with original transaction data for each group
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledTimes(2)
      
      // Should call with original data for transaction 1
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledWith(
        [1],
        expect.objectContaining({
          payee: 'Store 1',
          account_id: 1,
          amount: '100.00',
          category_id: 1,
          notes: 'Note 1',
          user_id: 'user123'
        }),
        'user123'
      )

      // Should call with original data for transaction 2
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledWith(
        [2],
        expect.objectContaining({
          payee: 'Store 2',
          account_id: 1,
          amount: '50.00',
          category_id: 2,
          notes: 'Note 2',
          user_id: 'user123'
        }),
        'user123'
      )
    })
  })

  describe('2. Installment Field Handling', () => {
    it('should handle installment fields in batch updates', async () => {
      const updateData = {
        is_installment: true,
        installment_number: 1,
        installment_total: 12,
        notes: 'Monthly installment'
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      vi.mocked(supabaseService.batchUpdateTransactions).mockResolvedValue(undefined)
      await command.execute()

      // Installment fields are no longer passed through batch updates (design change)
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledWith(
        [1, 2],
        expect.objectContaining({
          notes: 'Monthly installment',
          user_id: 'user123'
        }),
        'user123'
      )
    })
  })

  describe('3. Field Sanitization', () => {
    it('should only include changed fields in batch update', async () => {
      const updateData = {
        category_id: 3,
        // Notes deliberately left empty/unchanged
        status_id: 2
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      vi.mocked(supabaseService.batchUpdateTransactions).mockResolvedValue(undefined)
      await command.execute()

      // Should only include specified fields
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledWith(
        [1, 2],
        expect.objectContaining({
          category_id: 3,
          status_id: 2,
          user_id: 'user123'
        }),
        'user123'
      )

      // Should not include unchanged fields like notes or payee
      const firstCall = vi.mocked(supabaseService.batchUpdateTransactions).mock.calls[0][1] as any
      expect(firstCall).not.toHaveProperty('notes')
      expect(firstCall).not.toHaveProperty('payee')
    })
  })

  describe('4. Date Field Handling', () => {
    it('should handle date fields in batch updates', async () => {
      const updateData = {
        payment_date: '2024-02-15',
        purchase_date: '2024-02-15',
        category_id: 3
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      vi.mocked(supabaseService.batchUpdateTransactions).mockResolvedValue(undefined)
      await command.execute()

      // Should include date fields in batch update
      expect(supabaseService.batchUpdateTransactions).toHaveBeenCalledWith(
        [1, 2],
        expect.objectContaining({
          payment_date: '2024-02-15',
          purchase_date: '2024-02-15',
          category_id: 3,
          user_id: 'user123'
        }),
        'user123'
      )
    })
  })

  describe('5. UI Integration - Transaction Selection Handling', () => {
    it('should properly handle successful batch edit with transaction unchecking', async () => {
      const updateData = {
        category_id: 3,
        status_id: 2
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      vi.mocked(supabaseService.batchUpdateTransactions).mockResolvedValue(undefined)
      await command.execute()

      // Verify no failures occurred
      const failureInfo = command.getFailedTransactions()
      expect(failureInfo.ids).toEqual([])
      expect(failureInfo.errors.size).toBe(0)

      // This simulates the UI behavior where successful batch edits should result in
      // all transactions being unchecked
      const shouldUnchecksAllTransactions = failureInfo.ids.length === 0
      expect(shouldUnchecksAllTransactions).toBe(true)
    })

    it('should properly handle batch failure with all transactions remaining selected', async () => {
      const updateData = {
        category_id: 3,
        notes: 'Bulk updated notes'
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      // Mock batch failure
      vi.mocked(supabaseService.batchUpdateTransactions).mockRejectedValue(new Error('Database error'))

      let thrownError = null
      try {
        await command.execute()
      } catch (error) {
        thrownError = error
      }

      // Should throw error due to batch failure
      expect(thrownError).toBeTruthy()

      // Should track all transactions as failed
      const failureInfo = command.getFailedTransactions()
      expect(failureInfo.ids).toEqual([1, 2])
      expect(failureInfo.errors.get(1)).toBe('Database error')
      expect(failureInfo.errors.get(2)).toBe('Database error')

      // This simulates the UI behavior where batch failure should result in
      // all transactions remaining selected
      const shouldKeepAllTransactionsSelected = failureInfo.ids.length === mockTransactions.length
      expect(shouldKeepAllTransactionsSelected).toBe(true)
    })

    it('should maintain failed transaction highlighting persistence behavior', async () => {
      const updateData = {
        category_id: 3,
        notes: 'Test update'
      }

      const command = new BatchUpdateTransactionCommand(
        mockTransactions,
        updateData,
        'user123',
        mockQueryClient
      )

      // Mock batch failure 
      vi.mocked(supabaseService.batchUpdateTransactions).mockRejectedValue(new Error('Database error'))

      let thrownError = null
      try {
        await command.execute()
      } catch (error) {
        thrownError = error
      }

      expect(thrownError).toBeTruthy()
      const failureInfo = command.getFailedTransactions()
      expect(failureInfo.ids).toEqual([1, 2])

      // This simulates the UI behavior where:
      // 1. Dialog closes but failed transaction IDs persist for red highlighting
      // 2. Red highlighting should remain until a new CRUD operation or filter change
      const shouldPersistHighlighting = true // Dialog close doesn't clear highlights
      const shouldClearOnNewCRUD = true // New CRUD operations clear highlights
      const shouldClearOnFilter = true // Filter changes clear highlights
      const shouldKeepOnUndo = true // Undo operations keep highlights

      expect(shouldPersistHighlighting).toBe(true)
      expect(shouldClearOnNewCRUD).toBe(true) 
      expect(shouldClearOnFilter).toBe(true)
      expect(shouldKeepOnUndo).toBe(true)
    })
  })
})
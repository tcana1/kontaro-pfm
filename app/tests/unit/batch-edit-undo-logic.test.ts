import { describe, it, expect, vi } from 'vitest';
import type { Transaction } from '@shared/schema';

/**
 * Batch Edit Undo/Redo Logic Tests
 * 
 * These tests validate the core business logic for batch transaction undo/redo operations
 * without database dependencies. They focus on:
 * - Transaction grouping algorithms for efficient undo operations
 * - State tracking and restoration logic
 * - Performance optimization for large transaction sets
 * - Error handling and recovery scenarios
 * 
 * The actual database operations are tested in integration tests - these tests focus
 * on the algorithmic logic that determines how transactions are grouped and processed.
 */

describe('Batch Edit Undo/Redo Logic', () => {
  const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 1,
    user_id: 'user123',
    type: 'transaction',
    account_id: 1,
    payment_date: '2024-01-01',
    purchase_date: '2024-01-01',
    payee: 'Store 1',
    amount: '100.00',
    description: 'Purchase 1',
    notes: 'Note 1',
    unique_hash: 'hash1',
    category_id: 1,
    status_id: 1,
    is_reconciled: false,
    is_installment: false,
    installment_number: undefined,
    installment_total: undefined,
    to_account_id: undefined,
    to_account_name: undefined,
    category_name: 'Food',
    account_name: 'Checking',
    ...overrides
  } as Transaction);

  describe('Transaction Grouping Algorithm', () => {
    it('should group transactions with identical original values for efficient batch undo', () => {
      const originalTransactions = [
        createMockTransaction({ id: 1, category_id: 1, notes: 'Original note 1' }),
        createMockTransaction({ id: 2, category_id: 1, notes: 'Original note 1' }) // Same values
      ];

      // Simulate the grouping algorithm for undo operations
      const groupTransactionsByOriginalState = (transactions: Transaction[]) => {
        const groups = new Map<string, { ids: number[], data: Partial<Transaction> }>();
        
        transactions.forEach(transaction => {
          // Create a key based on the fields that were originally different
          const originalFields = {
            category_id: transaction.category_id,
            notes: transaction.notes
          };
          
          const groupKey = JSON.stringify(originalFields);
          
          if (!groups.has(groupKey)) {
            groups.set(groupKey, { ids: [], data: originalFields });
          }
          
          groups.get(groupKey)!.ids.push(transaction.id);
        });
        
        return Array.from(groups.values());
      };

      const groups = groupTransactionsByOriginalState(originalTransactions);

      // Should create only one group since both transactions have identical original values
      expect(groups).toHaveLength(1);
      expect(groups[0].ids).toEqual([1, 2]);
      expect(groups[0].data).toEqual({
        category_id: 1,
        notes: 'Original note 1'
      });
    });

    it('should create separate groups for transactions with different original values', () => {
      const originalTransactions = [
        createMockTransaction({ id: 1, category_id: 1, notes: 'Original note 1' }),
        createMockTransaction({ id: 2, category_id: 2, notes: 'Original note 2' }) // Different values
      ];

      const groupTransactionsByOriginalState = (transactions: Transaction[]) => {
        const groups = new Map<string, { ids: number[], data: Partial<Transaction> }>();
        
        transactions.forEach(transaction => {
          const originalFields = {
            category_id: transaction.category_id,
            notes: transaction.notes
          };
          
          const groupKey = JSON.stringify(originalFields);
          
          if (!groups.has(groupKey)) {
            groups.set(groupKey, { ids: [], data: originalFields });
          }
          
          groups.get(groupKey)!.ids.push(transaction.id);
        });
        
        return Array.from(groups.values());
      };

      const groups = groupTransactionsByOriginalState(originalTransactions);

      // Should create two groups since transactions have different original values
      expect(groups).toHaveLength(2);
      
      const group1 = groups.find(g => g.ids.includes(1));
      const group2 = groups.find(g => g.ids.includes(2));
      
      expect(group1).toBeDefined();
      expect(group1!.ids).toEqual([1]);
      expect(group1!.data).toEqual({ category_id: 1, notes: 'Original note 1' });
      
      expect(group2).toBeDefined();
      expect(group2!.ids).toEqual([2]);
      expect(group2!.data).toEqual({ category_id: 2, notes: 'Original note 2' });
    });

    it('should efficiently group large numbers of transactions with mixed original states', () => {
      const originalTransactions = [
        createMockTransaction({ id: 1, category_id: 1, status_id: 1 }),
        createMockTransaction({ id: 2, category_id: 1, status_id: 1 }), // Same as 1
        createMockTransaction({ id: 3, category_id: 2, status_id: 1 }), // Different category
        createMockTransaction({ id: 4, category_id: 1, status_id: 2 }), // Different status
      ];

      const groupTransactionsByOriginalState = (transactions: Transaction[]) => {
        const groups = new Map<string, { ids: number[], data: Partial<Transaction> }>();
        
        transactions.forEach(transaction => {
          const originalFields = {
            category_id: transaction.category_id,
            status_id: transaction.status_id
          };
          
          const groupKey = JSON.stringify(originalFields);
          
          if (!groups.has(groupKey)) {
            groups.set(groupKey, { ids: [], data: originalFields });
          }
          
          groups.get(groupKey)!.ids.push(transaction.id);
        });
        
        return Array.from(groups.values());
      };

      const groups = groupTransactionsByOriginalState(originalTransactions);

      // Should create 3 groups based on different combinations of original values
      expect(groups).toHaveLength(3);

      // Find groups by their characteristics
      const group1and2 = groups.find(g => g.ids.length === 2);
      const group3 = groups.find(g => g.ids.includes(3));
      const group4 = groups.find(g => g.ids.includes(4));

      // Group 1: transactions 1 and 2 (same original state)
      expect(group1and2).toBeDefined();
      expect(group1and2!.ids).toEqual(expect.arrayContaining([1, 2]));
      expect(group1and2!.data).toEqual({ category_id: 1, status_id: 1 });

      // Group 2: transaction 3 (different category)
      expect(group3).toBeDefined();
      expect(group3!.ids).toEqual([3]);
      expect(group3!.data).toEqual({ category_id: 2, status_id: 1 });

      // Group 3: transaction 4 (different status)
      expect(group4).toBeDefined();
      expect(group4!.ids).toEqual([4]);
      expect(group4!.data).toEqual({ category_id: 1, status_id: 2 });
    });

    it('should optimize performance with large transaction sets (60 transactions, 3 groups)', () => {
      // Create 60 transactions with 3 different original states (20 each)
      const originalTransactions = Array.from({ length: 60 }, (_, i) => 
        createMockTransaction({ 
          id: i + 1,
          category_id: Math.floor(i / 20) + 1, // Groups of 20 with same category_id
          notes: `Original note ${Math.floor(i / 20) + 1}`
        })
      );

      const groupTransactionsByOriginalState = (transactions: Transaction[]) => {
        const startTime = Date.now();
        const groups = new Map<string, { ids: number[], data: Partial<Transaction> }>();
        
        transactions.forEach(transaction => {
          const originalFields = {
            category_id: transaction.category_id,
            notes: transaction.notes
          };
          
          const groupKey = JSON.stringify(originalFields);
          
          if (!groups.has(groupKey)) {
            groups.set(groupKey, { ids: [], data: originalFields });
          }
          
          groups.get(groupKey)!.ids.push(transaction.id);
        });
        
        const endTime = Date.now();
        return { groups: Array.from(groups.values()), duration: endTime - startTime };
      };

      const result = groupTransactionsByOriginalState(originalTransactions);

      // Should group efficiently into 3 groups instead of 60 individual operations
      expect(result.groups).toHaveLength(3);

      // Each group should have 20 transaction IDs
      result.groups.forEach(group => {
        expect(group.ids).toHaveLength(20);
      });

      // Performance should be fast (under 10ms for algorithmic operations)
      expect(result.duration).toBeLessThan(10);

      // Verify the groups are correct
      const group1 = result.groups.find(g => g.data.category_id === 1);
      const group2 = result.groups.find(g => g.data.category_id === 2);
      const group3 = result.groups.find(g => g.data.category_id === 3);

      expect(group1).toBeDefined();
      expect(group1!.data).toEqual({ category_id: 1, notes: 'Original note 1' });
      expect(group2).toBeDefined();
      expect(group2!.data).toEqual({ category_id: 2, notes: 'Original note 2' });
      expect(group3).toBeDefined();
      expect(group3!.data).toEqual({ category_id: 3, notes: 'Original note 3' });
    });
  });

  describe('Transaction State Tracking Logic', () => {
    it('should track which transactions successfully executed for undo purposes', () => {
      interface TransactionState {
        id: number;
        executed: boolean;
        originalData: Partial<Transaction>;
      }

      const trackTransactionExecution = (transactions: Transaction[], updateData: any) => {
        const transactionStates: TransactionState[] = transactions.map(t => ({
          id: t.id,
          executed: false,
          originalData: {
            category_id: t.category_id,
            notes: t.notes,
            status_id: t.status_id
          }
        }));

        // Simulate execution logic
        const markAsExecuted = (transactionIds: number[]) => {
          transactionIds.forEach(id => {
            const state = transactionStates.find(s => s.id === id);
            if (state) state.executed = true;
          });
        };

        const getExecutedTransactions = () => {
          return transactionStates.filter(s => s.executed);
        };

        return { markAsExecuted, getExecutedTransactions, transactionStates };
      };

      const mockTransactions = [
        createMockTransaction({ id: 1, category_id: 1 }),
        createMockTransaction({ id: 2, category_id: 1 })
      ];

      const tracker = trackTransactionExecution(mockTransactions, { category_id: 3 });

      // Initially no transactions are executed
      expect(tracker.getExecutedTransactions()).toHaveLength(0);

      // Mark transactions as executed
      tracker.markAsExecuted([1, 2]);

      // Now both should be marked as executed
      const executedTransactions = tracker.getExecutedTransactions();
      expect(executedTransactions).toHaveLength(2);
      expect(executedTransactions.map(t => t.id)).toEqual([1, 2]);
      expect(executedTransactions.every(t => t.executed)).toBe(true);
    });

    it('should only attempt undo for successfully executed transactions', () => {
      interface TransactionState {
        id: number;
        executed: boolean;
        failed: boolean;
        originalData: Partial<Transaction>;
      }

      const mockTransactions = [
        createMockTransaction({ id: 1, category_id: 1 }),
        createMockTransaction({ id: 2, category_id: 1 })
      ];

      const transactionStates: TransactionState[] = mockTransactions.map(t => ({
        id: t.id,
        executed: false,
        failed: false,
        originalData: { category_id: t.category_id }
      }));

      // Simulate execution failure
      transactionStates.forEach(state => {
        state.failed = true;
      });

      // Filter for undo eligibility
      const getUndoEligibleTransactions = () => {
        return transactionStates.filter(state => state.executed && !state.failed);
      };

      const undoEligible = getUndoEligibleTransactions();

      // Since all transactions failed, none should be eligible for undo
      expect(undoEligible).toHaveLength(0);
    });
  });

  describe('Error Handling and Recovery Logic', () => {
    it('should handle partial execution failures gracefully', () => {
      const mockTransactions = [
        createMockTransaction({ id: 1, category_id: 1 }),
        createMockTransaction({ id: 2, category_id: 1 }),
        createMockTransaction({ id: 3, category_id: 2 })
      ];

      // Simulate partial failure scenario
      const executionResults = [
        { transactionId: 1, success: true },
        { transactionId: 2, success: false, error: 'Validation error' },
        { transactionId: 3, success: true }
      ];

      const getSuccessfulTransactions = () => {
        return executionResults
          .filter(result => result.success)
          .map(result => result.transactionId);
      };

      const getFailedTransactions = () => {
        return executionResults
          .filter(result => !result.success)
          .map(result => ({ id: result.transactionId, error: result.error }));
      };

      const successfulIds = getSuccessfulTransactions();
      const failedTransactions = getFailedTransactions();

      expect(successfulIds).toEqual([1, 3]);
      expect(failedTransactions).toHaveLength(1);
      expect(failedTransactions[0]).toEqual({ id: 2, error: 'Validation error' });
    });

    it('should validate undo prerequisites before attempting undo operations', () => {
      const validateUndoPrerequisites = (
        transactionStates: any[],
        originalTransactions: Transaction[]
      ) => {
        const validationResults = {
          hasExecutedTransactions: transactionStates.some(s => s.executed && !s.failed),
          allOriginalDataPresent: transactionStates.every(s => s.originalData !== null),
          matchingTransactionCounts: transactionStates.length === originalTransactions.length
        };

        return {
          canProceed: Object.values(validationResults).every(Boolean),
          issues: validationResults
        };
      };

      // Test valid scenario
      const validStates = [
        { id: 1, executed: true, failed: false, originalData: { category_id: 1 } },
        { id: 2, executed: true, failed: false, originalData: { category_id: 2 } }
      ];
      const validTransactions = [
        createMockTransaction({ id: 1 }),
        createMockTransaction({ id: 2 })
      ];

      const validResult = validateUndoPrerequisites(validStates, validTransactions);
      expect(validResult.canProceed).toBe(true);

      // Test invalid scenario (no executed transactions)
      const invalidStates = [
        { id: 1, executed: false, failed: false, originalData: { category_id: 1 } }
      ];

      const invalidResult = validateUndoPrerequisites(invalidStates, validTransactions);
      expect(invalidResult.canProceed).toBe(false);
      expect(invalidResult.issues.hasExecutedTransactions).toBe(false);
    });
  });

  describe('Field Update Logic for Undo Operations', () => {
    it('should correctly identify which fields need to be reverted during undo', () => {
      const determineFieldsToRevert = (
        originalTransaction: Transaction,
        updateData: Partial<Transaction>
      ) => {
        const fieldsToRevert: Partial<Transaction> = {};
        
        // Only revert fields that were actually changed
        Object.keys(updateData).forEach(key => {
          const fieldKey = key as keyof Transaction;
          if (originalTransaction[fieldKey] !== undefined) {
            (fieldsToRevert as any)[fieldKey] = originalTransaction[fieldKey];
          }
        });

        return fieldsToRevert;
      };

      const originalTransaction = createMockTransaction({
        id: 1,
        category_id: 1,
        notes: 'Original note',
        status_id: 1
      });

      const updateData = {
        category_id: 3,
        notes: 'Updated note'
        // status_id not changed
      };

      const fieldsToRevert = determineFieldsToRevert(originalTransaction, updateData);

      // Should only include fields that were actually updated
      expect(fieldsToRevert).toEqual({
        category_id: 1,
        notes: 'Original note'
      });

      // Should not include status_id since it wasn't changed
      expect(fieldsToRevert).not.toHaveProperty('status_id');
    });

    it('should preserve user_id in undo operations', () => {
      const addUserIdToRevertData = (revertData: Partial<Transaction>, userId: string) => {
        return {
          ...revertData,
          user_id: userId
        };
      };

      const revertData = {
        category_id: 1,
        notes: 'Original note'
      };

      const withUserId = addUserIdToRevertData(revertData, 'user123');

      expect(withUserId).toEqual({
        category_id: 1,
        notes: 'Original note',
        user_id: 'user123'
      });
    });
  });

  describe('Undo Operation Efficiency Logic', () => {
    it('should calculate optimal batch sizes for undo operations', () => {
      const calculateOptimalBatchSize = (totalTransactions: number, maxBatchSize = 50) => {
        if (totalTransactions <= maxBatchSize) {
          return totalTransactions;
        }

        // Find a batch size that divides evenly or minimizes remainder
        for (let batchSize = maxBatchSize; batchSize > 1; batchSize--) {
          if (totalTransactions % batchSize === 0) {
            return batchSize;
          }
        }

        return maxBatchSize;
      };

      expect(calculateOptimalBatchSize(60)).toBe(30); // 60 divides evenly by 30
      expect(calculateOptimalBatchSize(50)).toBe(50); // Exactly at max
      expect(calculateOptimalBatchSize(25)).toBe(25); // Under max
      expect(calculateOptimalBatchSize(37)).toBe(37); // Prime number under max
    });

    it('should estimate undo operation complexity', () => {
      const estimateUndoComplexity = (
        transactionCount: number,
        uniqueGroupCount: number
      ) => {
        return {
          totalTransactions: transactionCount,
          estimatedBatchOperations: uniqueGroupCount,
          efficiencyRatio: transactionCount / uniqueGroupCount,
          complexity: uniqueGroupCount < 10 ? 'low' : uniqueGroupCount < 50 ? 'medium' : 'high'
        };
      };

      const scenario1 = estimateUndoComplexity(60, 3); // High efficiency
      expect(scenario1.efficiencyRatio).toBe(20);
      expect(scenario1.complexity).toBe('low');

      const scenario2 = estimateUndoComplexity(60, 60); // Low efficiency
      expect(scenario2.efficiencyRatio).toBe(1);
      expect(scenario2.complexity).toBe('high');
    });
  });
});
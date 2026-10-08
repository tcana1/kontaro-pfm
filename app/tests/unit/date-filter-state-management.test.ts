/**
 * Date Filter State Management Tests
 *
 * These tests focus on validating that date range filter state is properly
 * managed in the transactions page, including filter counting, clearing,
 * and integration with other filter states.
 *
 * Key Testing Strategy:
 * - Filter counting: Test that dateRange is included in activeFilterCount
 * - State management: Test that dateRange persists and clears correctly
 * - Clear operations: Test that date filters are cleared with other filters
 * - Integration: Test dateRange with existing filter patterns
 *
 * Test Coverage:
 * - ✅ Date range filter counting logic
 * - ✅ Date range filter in clear operations
 * - ✅ Date range combined with other filter counts
 * - ✅ Filter state persistence and updates
 * - ✅ Edge cases with empty/invalid date ranges
 *
 * Note: These are unit tests for the filter state management logic
 * extracted from the transactions page component.
 */

import { describe, it, expect } from 'vitest';
import type { ActiveFilters } from '../../client/src/components/transactions/transaction-filter';

// Helper function to simulate the advancedFilterCount logic from transactions-page.tsx
// This counts only Advanced Filter types (status, categories, accounts) - NOT date range
const calculateAdvancedFilterCount = (activeFilters: ActiveFilters): number => {
  let count = 0;
  if (activeFilters.status?.length) count += activeFilters.status.length;
  if (activeFilters.categories?.length) count += activeFilters.categories.length;
  if (activeFilters.accounts?.length) count += activeFilters.accounts.length;
  return count;
};

// Helper function to simulate the total filter count logic (all filters including date range)
const calculateTotalActiveFilterCount = (activeFilters: ActiveFilters): number => {
  let count = calculateAdvancedFilterCount(activeFilters);
  if (activeFilters.dateRange?.from) count += 1;
  return count;
};

// Helper function to simulate checking if any filter is active
const isAnyFilterActive = (activeFilters: ActiveFilters, search: string = ''): boolean => {
  const filterCount = calculateTotalActiveFilterCount(activeFilters);
  return filterCount > 0 || search.length > 0;
};

// Helper function to simulate clearing all filters
const clearAllFilters = (activeFilters: ActiveFilters): ActiveFilters => {
  return {};
};

// Helper function to simulate clearing just the date filter
const clearDateFilter = (activeFilters: ActiveFilters): ActiveFilters => {
  const { dateRange, ...filtersWithoutDate } = activeFilters;
  return filtersWithoutDate;
};

describe('Date Filter State Management Tests', () => {
  describe('1. Advanced Filter Count (Excludes Date Range)', () => {
    it('should NOT count date range filter in advanced filter count', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        }
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(0); // Advanced filter should NOT count date range
      expect(totalCount).toBe(1); // Total count should include date range
    });

    it('should count only advanced filters when both date range and advanced filters are present', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01')
        },
        categories: [1, 2],
        status: ['cleared']
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(3); // 2 categories + 1 status (NO date range)
      expect(totalCount).toBe(4); // 2 categories + 1 status + 1 date range
    });

    it('should return 0 for advanced filter count when only date range is active', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        }
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      expect(advancedCount).toBe(0); // Advanced filter count should be 0
    });

    it('should count advanced filters correctly without date range', () => {
      const activeFilters: ActiveFilters = {
        categories: [1, 2, 3],
        accounts: [101, 102],
        status: ['cleared', 'pending']
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(7); // 3 categories + 2 accounts + 2 status
      expect(totalCount).toBe(7); // Same as advanced since no date range
    });
  });

  describe('2. Total Filter Counting (Includes Date Range)', () => {
    it('should count date range with other filter types correctly in total count', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        categories: [1, 2, 3],
        status: ['cleared']
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(4); // 3 categories + 1 status (NO date range)
      expect(totalCount).toBe(5); // 1 date + 3 categories + 1 status
    });

    it('should count date range with all filter types', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        categories: [1, 5],
        accounts: [101, 102, 103],
        status: ['cleared', 'pending']
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(7); // 2 categories + 3 accounts + 2 status (NO date range)
      expect(totalCount).toBe(8); // 1 date + 2 categories + 3 accounts + 2 status
    });

    it('should handle mixed filter states with date range', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01')
          // No 'to' date
        },
        categories: [], // Empty array
        accounts: [201], // One account
        status: ['cleared', 'ignored', 'pending'] // Three statuses
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(4); // 0 categories + 1 account + 3 status (NO date range)
      expect(totalCount).toBe(5); // 1 date + 0 categories + 1 account + 3 status
    });

    it('should handle empty filters with date range present', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        categories: [],
        accounts: [],
        status: []
      };

      const advancedCount = calculateAdvancedFilterCount(activeFilters);
      const totalCount = calculateTotalActiveFilterCount(activeFilters);
      
      expect(advancedCount).toBe(0); // No advanced filters
      expect(totalCount).toBe(1); // Only date range
    });
  });

  describe('3. Filter Active State Detection', () => {
    it('should detect active filters when only date range is set', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        }
      };

      const isActive = isAnyFilterActive(activeFilters);
      expect(isActive).toBe(true);
    });

    it('should detect active filters when date range and search are set', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01')
        }
      };

      const isActive = isAnyFilterActive(activeFilters, 'grocery');
      expect(isActive).toBe(true);
    });

    it('should detect active filters when only search is set (no date range)', () => {
      const activeFilters: ActiveFilters = {};

      const isActive = isAnyFilterActive(activeFilters, 'restaurant');
      expect(isActive).toBe(true);
    });

    it('should detect no active filters when date range has no FROM date', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          to: new Date('2023-04-30')
          // No 'from' date
        }
      };

      const isActive = isAnyFilterActive(activeFilters);
      expect(isActive).toBe(false);
    });

    it('should detect no active filters when everything is empty', () => {
      const activeFilters: ActiveFilters = {};

      const isActive = isAnyFilterActive(activeFilters, '');
      expect(isActive).toBe(false);
    });
  });

  describe('4. Clear Filter Operations', () => {
    it('should clear all filters including date range', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        categories: [1, 2, 3],
        accounts: [101],
        status: ['cleared']
      };

      const clearedFilters = clearAllFilters(activeFilters);
      
      expect(clearedFilters).toEqual({});
      expect(calculateTotalActiveFilterCount(clearedFilters)).toBe(0);
    });

    it('should clear only date range filter', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        categories: [1, 2],
        status: ['cleared']
      };

      const filtersWithoutDate = clearDateFilter(activeFilters);
      
      expect(filtersWithoutDate).toEqual({
        categories: [1, 2],
        status: ['cleared']
      });
      expect(filtersWithoutDate.dateRange).toBeUndefined();
      expect(calculateTotalActiveFilterCount(filtersWithoutDate)).toBe(3); // 2 categories + 1 status
    });

    it('should handle clearing date range when it is undefined', () => {
      const activeFilters: ActiveFilters = {
        categories: [1],
        accounts: [101]
      };

      const filtersWithoutDate = clearDateFilter(activeFilters);
      
      expect(filtersWithoutDate).toEqual({
        categories: [1],
        accounts: [101]
      });
      expect(calculateTotalActiveFilterCount(filtersWithoutDate)).toBe(2);
    });

    it('should handle clearing date range when it is empty object', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {},
        categories: [5]
      };

      const filtersWithoutDate = clearDateFilter(activeFilters);
      
      expect(filtersWithoutDate).toEqual({
        categories: [5]
      });
      expect(filtersWithoutDate.dateRange).toBeUndefined();
      expect(calculateTotalActiveFilterCount(filtersWithoutDate)).toBe(1);
    });
  });

  describe('5. Filter State Updates and Persistence', () => {
    it('should properly update date range filter while preserving other filters', () => {
      const initialFilters: ActiveFilters = {
        categories: [1, 2],
        status: ['cleared']
      };

      const updatedFilters: ActiveFilters = {
        ...initialFilters,
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        }
      };

      expect(calculateTotalActiveFilterCount(updatedFilters)).toBe(4); // 2 categories + 1 status + 1 date
      expect(updatedFilters.categories).toEqual([1, 2]);
      expect(updatedFilters.status).toEqual(['cleared']);
      expect(updatedFilters.dateRange).toBeDefined();
    });

    it('should properly update date range filter by replacing existing date range', () => {
      const initialFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-01-01'),
          to: new Date('2023-01-31')
        },
        categories: [3]
      };

      const updatedFilters: ActiveFilters = {
        ...initialFilters,
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        }
      };

      expect(calculateTotalActiveFilterCount(updatedFilters)).toBe(2); // 1 category + 1 new date range
      expect(updatedFilters.dateRange.from).toEqual(new Date('2023-04-01'));
      expect(updatedFilters.dateRange.to).toEqual(new Date('2023-04-30'));
    });

    it('should handle updating date range to have only FROM date', () => {
      const initialFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-01-01'),
          to: new Date('2023-01-31')
        }
      };

      const updatedFilters: ActiveFilters = {
        ...initialFilters,
        dateRange: {
          from: new Date('2023-04-01')
          // No 'to' date
        }
      };

      expect(calculateTotalActiveFilterCount(updatedFilters)).toBe(1);
      expect(updatedFilters.dateRange.from).toEqual(new Date('2023-04-01'));
      expect(updatedFilters.dateRange.to).toBeUndefined();
    });
  });

  describe('6. Edge Cases and Validation', () => {
    it('should handle invalid Date objects in filter counting', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('invalid-date'),
          to: new Date('2023-04-30')
        }
      };

      // Invalid Date objects still have the 'from' property, so should count as 1
      const count = calculateTotalActiveFilterCount(activeFilters);
      expect(count).toBe(1);
    });

    it('should handle null values in date range', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: null as any,
          to: new Date('2023-04-30')
        }
      };

      // Null 'from' should not count
      const count = calculateTotalActiveFilterCount(activeFilters);
      expect(count).toBe(0);
    });

    it('should handle mixed valid and invalid date ranges', () => {
      const activeFilters: ActiveFilters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('invalid-date')
        },
        categories: [1]
      };

      // Should count date range (has valid 'from') + categories
      const count = calculateTotalActiveFilterCount(activeFilters);
      expect(count).toBe(2);
    });

    it('should handle deeply nested filter state updates', () => {
      const complexState = {
        filters: {
          dateRange: {
            from: new Date('2023-04-01'),
            to: new Date('2023-04-30')
          },
          categories: [1, 2, 3],
          accounts: [101, 102]
        },
        search: 'grocery',
        otherSettings: {
          sortBy: 'date',
          sortDirection: 'desc'
        }
      };

      // Clear date filter while preserving other state
      const updatedState = {
        ...complexState,
        filters: {
          ...complexState.filters,
          dateRange: undefined
        }
      };

      expect(calculateTotalActiveFilterCount(updatedState.filters)).toBe(5); // 3 categories + 2 accounts
      expect(updatedState.search).toBe('grocery');
      expect(updatedState.otherSettings).toEqual({
        sortBy: 'date',
        sortDirection: 'desc'
      });
    });
  });
});
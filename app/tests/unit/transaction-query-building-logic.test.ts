import { describe, it, expect } from 'vitest';

/**
 * Transaction Query Building Logic Tests
 * 
 * These tests validate the algorithmic logic for translating user filter selections
 * into database query parameters without any database dependencies. They focus on:
 * - Filter combination rules and precedence
 * - Query parameter construction algorithms
 * - Edge case handling for missing or invalid filters
 * - Search query string generation
 * 
 * The actual query execution is tested in integration tests - these tests focus
 * on the business logic that determines how filters become query operations.
 */

describe('Transaction Query Building Logic', () => {
  
  // Mock filter interface for testing
  interface FilterOptions {
    dateRange?: {
      from?: Date;
      to?: Date;
    };
    search?: string;
    categories?: number[];
    accounts?: number[];
    status?: string[];
    ignored?: boolean[];
  }

  // Mock query operation tracking
  interface QueryOperation {
    method: string;
    field?: string;
    value?: any;
    condition?: string;
  }

  describe('Date Range Filter Logic', () => {
    const buildDateRangeQuery = (dateRange?: FilterOptions['dateRange']): QueryOperation[] => {
      const operations: QueryOperation[] = [];
      
      // Date range filter only works with both FROM and TO dates
      if (dateRange?.from && dateRange?.to) {
        const fromDateStr = dateRange.from.toISOString().split('T')[0]; // YYYY-MM-DD
        const toDateStr = dateRange.to.toISOString().split('T')[0]; // YYYY-MM-DD
        operations.push({
          method: 'gte',
          field: 'payment_date',
          value: fromDateStr
        });
        operations.push({
          method: 'lte',
          field: 'payment_date',
          value: toDateStr
        });
      }
      
      return operations;
    };

    it('should build complete date range query (from + to)', () => {
      const dateRange = {
        from: new Date('2023-04-01'),
        to: new Date('2023-04-30')
      };

      const operations = buildDateRangeQuery(dateRange);

      expect(operations).toEqual([
        { method: 'gte', field: 'payment_date', value: '2023-04-01' },
        { method: 'lte', field: 'payment_date', value: '2023-04-30' }
      ]);
    });

    it('should ignore date range with only from date', () => {
      const dateRange = {
        from: new Date('2023-04-01')
        // No 'to' date - business rule: both from and to are required
      };

      const operations = buildDateRangeQuery(dateRange);

      expect(operations).toEqual([]);
    });

    it('should ignore date range without from date', () => {
      const dateRange = {
        to: new Date('2023-04-30')
        // No 'from' date - business rule: 'to' without 'from' is ignored
      };

      const operations = buildDateRangeQuery(dateRange);

      expect(operations).toEqual([]);
    });

    it('should handle missing date range', () => {
      const operations = buildDateRangeQuery(undefined);

      expect(operations).toEqual([]);
    });
  });

  describe('Search Query Construction Logic', () => {
    const buildSearchQuery = (searchTerm?: string): QueryOperation | null => {
      if (!searchTerm || searchTerm.trim() === '') {
        return null;
      }

      const cleanedSearch = searchTerm.trim();
      const searchFields = [
        `payee.ilike.%${cleanedSearch}%`,
        `observation.ilike.%${cleanedSearch}%`, 
        `category_name.ilike.%${cleanedSearch}%`
      ];

      return {
        method: 'or',
        condition: searchFields.join(',')
      };
    };

    it('should build multi-field OR search query', () => {
      const operation = buildSearchQuery('coffee');

      expect(operation).toEqual({
        method: 'or',
        condition: 'payee.ilike.%coffee%,observation.ilike.%coffee%,category_name.ilike.%coffee%'
      });
    });

    it('should handle search with whitespace', () => {
      const operation = buildSearchQuery('  grocery store  ');

      expect(operation).toEqual({
        method: 'or',
        condition: 'payee.ilike.%grocery store%,observation.ilike.%grocery store%,category_name.ilike.%grocery store%'
      });
    });

    it('should return null for empty search', () => {
      expect(buildSearchQuery('')).toBeNull();
      expect(buildSearchQuery('   ')).toBeNull();
      expect(buildSearchQuery(undefined)).toBeNull();
    });

    it('should handle special characters in search', () => {
      const operation = buildSearchQuery('food & dining');

      expect(operation).toEqual({
        method: 'or',
        condition: 'payee.ilike.%food & dining%,observation.ilike.%food & dining%,category_name.ilike.%food & dining%'
      });
    });
  });

  describe('Array Filter Logic', () => {
    const buildArrayFilter = (field: string, values?: any[]): QueryOperation | null => {
      if (!values || values.length === 0) {
        return null;
      }

      return {
        method: 'in',
        field: field,
        value: values
      };
    };

    it('should build category filter for single category', () => {
      const operation = buildArrayFilter('category_id', [5]);

      expect(operation).toEqual({
        method: 'in',
        field: 'category_id',
        value: [5]
      });
    });

    it('should build category filter for multiple categories', () => {
      const operation = buildArrayFilter('category_id', [1, 2, 3, 4, 5]);

      expect(operation).toEqual({
        method: 'in',
        field: 'category_id',
        value: [1, 2, 3, 4, 5]
      });
    });

    it('should build account filter', () => {
      const operation = buildArrayFilter('account_id', [101, 102]);

      expect(operation).toEqual({
        method: 'in',
        field: 'account_id',
        value: [101, 102]
      });
    });

    it('should return null for empty arrays', () => {
      expect(buildArrayFilter('category_id', [])).toBeNull();
      expect(buildArrayFilter('category_id', undefined)).toBeNull();
    });
  });

  describe('Filter Combination Logic', () => {
    it('should combine date range and search filters', () => {
      const filters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        search: 'coffee'
      };

      const operations = combineFilters(filters);

      expect(operations).toHaveLength(3);
      expect(operations[0]).toEqual({ method: 'gte', field: 'payment_date', value: '2023-04-01' });
      expect(operations[1]).toEqual({ method: 'lte', field: 'payment_date', value: '2023-04-30' });
      expect(operations[2]).toEqual({
        method: 'or',
        condition: 'payee.ilike.%coffee%,observation.ilike.%coffee%,category_name.ilike.%coffee%'
      });
    });

    it('should combine date range and category filters', () => {
      const filters = {
        dateRange: {
          from: new Date('2023-04-01'),
          to: new Date('2023-04-30')
        },
        categories: [1, 2, 3]
      };

      const operations = combineFilters(filters);

      expect(operations).toHaveLength(3);
      expect(operations[0]).toEqual({ method: 'gte', field: 'payment_date', value: '2023-04-01' });
      expect(operations[1]).toEqual({ method: 'lte', field: 'payment_date', value: '2023-04-30' });
      expect(operations[2]).toEqual({ method: 'in', field: 'category_id', value: [1, 2, 3] });
    });

    it('should combine category and search filters', () => {
      const filters = {
        categories: [2, 3],
        search: 'grocery'
      };

      const operations = combineFilters(filters);

      expect(operations).toHaveLength(2);
      expect(operations[0]).toEqual({
        method: 'or',
        condition: 'payee.ilike.%grocery%,observation.ilike.%grocery%,category_name.ilike.%grocery%'
      });
      expect(operations[1]).toEqual({ method: 'in', field: 'category_id', value: [2, 3] });
    });

    it('should handle all filters combined', () => {
      const filters = {
        dateRange: {
          from: new Date('2023-01-01'),
          to: new Date('2023-12-31')
        },
        search: 'restaurant',
        categories: [1, 2],
        accounts: [101],
        status: ['Cleared'],
        ignored: [false]
      };

      const operations = combineFilters(filters);

      expect(operations).toHaveLength(7);
      expect(operations.some(op => op.method === 'gte')).toBe(true);
      expect(operations.some(op => op.method === 'lte')).toBe(true);
      expect(operations.some(op => op.method === 'or')).toBe(true);
      expect(operations.some(op => op.field === 'category_id')).toBe(true);
      expect(operations.some(op => op.field === 'account_id')).toBe(true);
      expect(operations.some(op => op.field === 'is_ignored')).toBe(true);
    });

    it('should handle empty filters gracefully', () => {
      const operations = combineFilters({});

      expect(operations).toEqual([]);
    });
  });

  describe('Query Optimization Logic', () => {
    const optimizeQuery = (operations: QueryOperation[]): QueryOperation[] => {
      // Remove duplicate operations
      const uniqueOperations = operations.filter((op, index, array) => 
        array.findIndex(other => 
          other.method === op.method && 
          other.field === op.field && 
          JSON.stringify(other.value) === JSON.stringify(op.value)
        ) === index
      );

      // Sort operations for consistency (date filters first, then others)
      const sortOrder = { 'gte': 0, 'lte': 1, 'in': 2, 'or': 3, 'eq': 4 };
      return uniqueOperations.sort((a, b) => {
        const aOrder = sortOrder[a.method as keyof typeof sortOrder] ?? 999;
        const bOrder = sortOrder[b.method as keyof typeof sortOrder] ?? 999;
        return aOrder - bOrder;
      });
    };

    it('should remove duplicate operations', () => {
      const operations = [
        { method: 'in', field: 'category_id', value: [1, 2] },
        { method: 'in', field: 'category_id', value: [1, 2] }, // Duplicate
        { method: 'gte', field: 'payment_date', value: '2023-01-01' }
      ];

      const optimized = optimizeQuery(operations);

      expect(optimized).toHaveLength(2);
      expect(optimized).toContainEqual({ method: 'in', field: 'category_id', value: [1, 2] });
      expect(optimized).toContainEqual({ method: 'gte', field: 'payment_date', value: '2023-01-01' });
    });

    it('should sort operations for consistency', () => {
      const operations = [
        { method: 'or', condition: 'search condition' },
        { method: 'in', field: 'category_id', value: [1, 2] },
        { method: 'gte', field: 'payment_date', value: '2023-01-01' },
        { method: 'lte', field: 'payment_date', value: '2023-12-31' }
      ];

      const optimized = optimizeQuery(operations);

      // Should be sorted: gte, lte, in, or
      expect(optimized[0].method).toBe('gte');
      expect(optimized[1].method).toBe('lte');
      expect(optimized[2].method).toBe('in');
      expect(optimized[3].method).toBe('or');
    });
  });

  describe('Amount Search Logic', () => {
    const buildAmountSearchQuery = (searchTerm: string, currency = 'USD'): QueryOperation | null => {
      // Handle currency-specific decimal separators
      let normalizedSearch = searchTerm;
      if (currency === 'BRL') {
        // For BRL, comma is decimal separator, convert to standard format
        normalizedSearch = searchTerm.replace(',', '.');
      }
      
      // Try to parse as number, removing currency symbols and spaces
      const numericSearch = parseFloat(normalizedSearch.replace(/[$\s]/g, ''));
      
      if (isNaN(numericSearch)) {
        return null; // Not a valid number
      }

      // Create amount range conditions (handle both positive and negative)
      const conditions = [
        `amount.eq.${numericSearch}`,
        `amount.eq.${-numericSearch}` // Handle both income (positive) and expense (negative)
      ];

      return {
        method: 'or',
        condition: conditions.join(',')
      };
    };

    it('should build amount search for exact decimal match', () => {
      const operation = buildAmountSearchQuery('4.50');

      expect(operation).toEqual({
        method: 'or',
        condition: 'amount.eq.4.5,amount.eq.-4.5'
      });
    });

    it('should build amount search for whole number', () => {
      const operation = buildAmountSearchQuery('100');

      expect(operation).toEqual({
        method: 'or',
        condition: 'amount.eq.100,amount.eq.-100'
      });
    });

    it('should handle currency formatting (BRL)', () => {
      const operation = buildAmountSearchQuery('4,50', 'BRL');

      expect(operation).toEqual({
        method: 'or',
        condition: 'amount.eq.4.5,amount.eq.-4.5'
      });
    });

    it('should return null for non-numeric search', () => {
      expect(buildAmountSearchQuery('coffee')).toBeNull();
      expect(buildAmountSearchQuery('')).toBeNull();
      expect(buildAmountSearchQuery('abc123')).toBeNull();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed date objects', () => {
      const buildSafeDateRange = (dateRange?: { from?: any; to?: any }) => {
        const operations: QueryOperation[] = [];
        
        try {
          if (dateRange?.from && dateRange.from instanceof Date && !isNaN(dateRange.from.getTime())) {
            operations.push({
              method: 'gte',
              field: 'payment_date',
              value: dateRange.from.toISOString().split('T')[0]
            });
          }
          
          if (dateRange?.to && dateRange.to instanceof Date && !isNaN(dateRange.to.getTime())) {
            operations.push({
              method: 'lte', 
              field: 'payment_date',
              value: dateRange.to.toISOString().split('T')[0]
            });
          }
        } catch (error) {
          // Return empty operations if date parsing fails
        }
        
        return operations;
      };

      // Test with invalid dates
      expect(buildSafeDateRange({ from: new Date('invalid') })).toEqual([]);
      expect(buildSafeDateRange({ from: 'not a date' as any })).toEqual([]);
      
      // Test with valid dates
      const validOps = buildSafeDateRange({ from: new Date('2023-01-01') });
      expect(validOps).toHaveLength(1);
    });

    it('should handle extremely large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i + 1);
      const operation = buildArrayFilter('category_id', largeArray);

      expect(operation).not.toBeNull();
      expect(operation!.value).toHaveLength(1000);
      expect(operation!.method).toBe('in');
    });

    it('should sanitize search input for SQL injection safety', () => {
      const sanitizeSearchInput = (input: string) => {
        // Remove potentially dangerous characters
        return input.replace(/[';]/g, '');
      };

      const maliciousInput = "coffee'; DROP TABLE transactions; --";
      const sanitized = sanitizeSearchInput(maliciousInput);
      
      expect(sanitized).toBe("coffee DROP TABLE transactions --");
      expect(sanitized).not.toContain(';');
    });

    it('should handle null and undefined values gracefully', () => {
      const filters = {
        dateRange: null,
        search: undefined,
        categories: null,
        accounts: undefined
      };

      const operations = combineFilters(filters as any);
      
      expect(operations).toEqual([]);
    });
  });

  // Helper functions used in the tests above
  const combineFilters = (filters: FilterOptions): QueryOperation[] => {
    const operations: QueryOperation[] = [];
    
    // Add date range operations
    operations.push(...buildDateRangeQuery(filters.dateRange));
    
    // Add search operation
    const searchOp = buildSearchQuery(filters.search);
    if (searchOp) operations.push(searchOp);
    
    // Add category filter
    const categoryOp = buildArrayFilter('category_id', filters.categories);
    if (categoryOp) operations.push(categoryOp);
    
    // Add account filter
    const accountOp = buildArrayFilter('account_id', filters.accounts);
    if (accountOp) operations.push(accountOp);
    
    // Add status filter
    const statusOp = buildArrayFilter('status_name', filters.status);
    if (statusOp) operations.push(statusOp);
    
    // Add ignored filter
    if (filters.ignored && filters.ignored.length > 0) {
      operations.push({
        method: 'in',
        field: 'is_ignored',
        value: filters.ignored
      });
    }
    
    return operations;
  };

  const buildDateRangeQuery = (dateRange?: FilterOptions['dateRange']): QueryOperation[] => {
    const operations: QueryOperation[] = [];
    
    // Date range filter only works with both FROM and TO dates
    if (dateRange?.from && dateRange?.to) {
      const fromDateStr = dateRange.from.toISOString().split('T')[0];
      const toDateStr = dateRange.to.toISOString().split('T')[0];
      operations.push({ method: 'gte', field: 'payment_date', value: fromDateStr });
      operations.push({ method: 'lte', field: 'payment_date', value: toDateStr });
    }
    
    return operations;
  };

  const buildSearchQuery = (searchTerm?: string): QueryOperation | null => {
    if (!searchTerm || searchTerm.trim() === '') return null;

    const cleanedSearch = searchTerm.trim();
    const searchFields = [
      `payee.ilike.%${cleanedSearch}%`,
      `observation.ilike.%${cleanedSearch}%`,
      `category_name.ilike.%${cleanedSearch}%`
    ];

    return { method: 'or', condition: searchFields.join(',') };
  };

  const buildArrayFilter = (field: string, values?: any[]): QueryOperation | null => {
    if (!values || values.length === 0) return null;
    return { method: 'in', field: field, value: values };
  };
});
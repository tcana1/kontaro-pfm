import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Date range preset calculation logic (extracted from DateRangeSelector)
const getDateRangePresets = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return [
    {
      label: 'Last Month',
      value: 'last_month',
      startDate: new Date(currentYear, currentMonth - 1, 1),
      endDate: new Date(currentYear, currentMonth, 0)
    },
    {
      label: 'Last 6 Months', 
      value: 'last_6_months',
      startDate: new Date(currentYear, currentMonth - 6, 1),
      endDate: new Date(currentYear, currentMonth, 0)
    },
    {
      label: 'Last 12 Months',
      value: 'last_12_months', 
      startDate: new Date(currentYear, currentMonth - 12, 1),
      endDate: new Date(currentYear, currentMonth, 0)
    },
    {
      label: 'This Year',
      value: 'this_year',
      startDate: new Date(currentYear, 0, 1),
      endDate: new Date(currentYear, currentMonth, now.getDate())
    },
    {
      label: 'Last Year',
      value: 'last_year',
      startDate: new Date(currentYear - 1, 0, 1),
      endDate: new Date(currentYear - 1, 11, 31)
    },
    {
      label: 'All Time',
      value: 'all_time',
      startDate: new Date(1900, 0, 1),
      endDate: new Date(currentYear, currentMonth, now.getDate())
    }
  ];
};

// Filter parameter transformation logic
const transformFiltersToQueryParams = (filters: {
  startDate: Date;
  endDate: Date;
  accountIds: string[];
  categoryIds: string[];
  groupIds: string[];
}) => {
  const getDbFilterArray = (filterArray: string[]) => {
    if (filterArray.includes('all') || filterArray.length === 0) {
      return null;
    }
    return filterArray.map(id => parseInt(id, 10));
  };

  return {
    start_date: filters.startDate.toISOString().split('T')[0],
    end_date: filters.endDate.toISOString().split('T')[0],
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
  };
};

describe('Report Filter Logic', () => {
  describe('Date Range Presets', () => {
    beforeEach(() => {
      // Mock current date to March 15, 2024 for consistent testing. Built from local
      // parts, not new Date('2024-03-15'): that string is parsed as UTC midnight, which
      // is still March 14 at a negative offset, so now.getDate() would be off by one.
      vi.setSystemTime(new Date(2024, 2, 15));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should calculate Last Month correctly (complete previous month)', () => {
      const presets = getDateRangePresets();
      const lastMonth = presets.find(p => p.value === 'last_month');
      
      expect(lastMonth).toBeDefined();
      expect(lastMonth!.startDate.getTime()).toEqual(new Date(2024, 1, 1).getTime()); // Feb 1
      expect(lastMonth!.endDate.getTime()).toEqual(new Date(2024, 1, 29).getTime());   // Feb 29 (2024 is leap year)
    });

    it('should calculate Last 6 Months correctly (6 complete months)', () => {
      const presets = getDateRangePresets();
      const last6Months = presets.find(p => p.value === 'last_6_months');
      
      expect(last6Months).toBeDefined();
      expect(last6Months!.startDate.getTime()).toEqual(new Date(2023, 8, 1).getTime()); // Sep 1
      expect(last6Months!.endDate.getTime()).toEqual(new Date(2024, 1, 29).getTime());   // Feb 29
    });

    it('should calculate Last 12 Months correctly (12 complete months)', () => {
      const presets = getDateRangePresets();
      const last12Months = presets.find(p => p.value === 'last_12_months');
      
      expect(last12Months).toBeDefined();
      expect(last12Months!.startDate.getTime()).toEqual(new Date(2023, 2, 1).getTime()); // Mar 1
      expect(last12Months!.endDate.getTime()).toEqual(new Date(2024, 1, 29).getTime());   // Feb 29
    });

    it('should calculate This Year correctly (Jan 1 to today)', () => {
      const presets = getDateRangePresets();
      const thisYear = presets.find(p => p.value === 'this_year');

      expect(thisYear).toBeDefined();
      expect(thisYear!.startDate.getTime()).toEqual(new Date(2024, 0, 1).getTime()); // Jan 1
      expect(thisYear!.endDate.getTime()).toEqual(new Date(2024, 2, 15).getTime());   // Mar 15 (today)
    });

    it('should calculate Last Year correctly (full previous calendar year)', () => {
      const presets = getDateRangePresets();
      const lastYear = presets.find(p => p.value === 'last_year');
      
      expect(lastYear).toBeDefined();
      expect(lastYear!.startDate.getTime()).toEqual(new Date(2023, 0, 1).getTime()); // Jan 1
      expect(lastYear!.endDate.getTime()).toEqual(new Date(2023, 11, 31).getTime());   // Dec 31
    });

    it('should handle January edge case for This Year (includes current partial month)', () => {
      vi.setSystemTime(new Date(2024, 0, 15));

      const presets = getDateRangePresets();
      const thisYear = presets.find(p => p.value === 'this_year');

      expect(thisYear).toBeDefined();
      expect(thisYear!.startDate.getTime()).toEqual(new Date(2024, 0, 1).getTime()); // Jan 1
      expect(thisYear!.endDate.getTime()).toEqual(new Date(2024, 0, 15).getTime());   // Jan 15 (today)
    });

    it('should calculate All Time correctly (from 1900 to today)', () => {
      const presets = getDateRangePresets();
      const allTime = presets.find(p => p.value === 'all_time');

      expect(allTime).toBeDefined();
      expect(allTime!.startDate.getTime()).toEqual(new Date(1900, 0, 1).getTime()); // Jan 1, 1900
      expect(allTime!.endDate.getTime()).toEqual(new Date(2024, 2, 15).getTime());   // Mar 15 (today)
    });

    it('should handle All Time correctly when in January (end date is today)', () => {
      vi.setSystemTime(new Date(2024, 0, 15));

      const presets = getDateRangePresets();
      const allTime = presets.find(p => p.value === 'all_time');

      expect(allTime).toBeDefined();
      expect(allTime!.startDate.getTime()).toEqual(new Date(1900, 0, 1).getTime()); // Jan 1, 1900
      expect(allTime!.endDate.getTime()).toEqual(new Date(2024, 0, 15).getTime());   // Jan 15 (today)
    });
  });

  describe('Filter Parameter Transformation', () => {
    it('should transform filters to query parameters correctly', () => {
      const filters = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        accountIds: ['123'],
        categoryIds: ['456'],
        groupIds: ['789']
      };

      const result = transformFiltersToQueryParams(filters);

      expect(result).toEqual({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        input_account_ids: [123],
        input_category_ids: [456],
        input_group_ids: [789]
      });
    });

    it('should handle "all" values correctly (convert to null)', () => {
      const filters = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        accountIds: ['all'],
        categoryIds: ['all'],
        groupIds: ['all']
      };

      const result = transformFiltersToQueryParams(filters);

      expect(result).toEqual({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        input_account_ids: null,
        input_category_ids: null,
        input_group_ids: null
      });
    });

    it('should handle mixed filter values correctly', () => {
      const filters = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-29'),
        accountIds: ['100'],
        categoryIds: ['all'],
        groupIds: ['200']
      };

      const result = transformFiltersToQueryParams(filters);

      expect(result).toEqual({
        start_date: '2024-02-01',
        end_date: '2024-02-29',
        input_account_ids: [100],
        input_category_ids: null,
        input_group_ids: [200]
      });
    });

    it('should handle multiple filter values correctly', () => {
      const filters = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-29'),
        accountIds: ['100', '200', '300'],
        categoryIds: ['456', '789'],
        groupIds: ['all']
      };

      const result = transformFiltersToQueryParams(filters);

      expect(result).toEqual({
        start_date: '2024-02-01',
        end_date: '2024-02-29',
        input_account_ids: [100, 200, 300],
        input_category_ids: [456, 789],
        input_group_ids: null
      });
    });

    it('should handle empty filter arrays (convert to null)', () => {
      const filters = {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-29'),
        accountIds: [],
        categoryIds: [],
        groupIds: []
      };

      const result = transformFiltersToQueryParams(filters);

      expect(result).toEqual({
        start_date: '2024-02-01',
        end_date: '2024-02-29',
        input_account_ids: null,
        input_category_ids: null,
        input_group_ids: null
      });
    });

    it('should handle invalid numeric IDs gracefully', () => {
      const filters = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        accountIds: ['invalid'],
        categoryIds: [''],
        groupIds: ['NaN']
      };

      const result = transformFiltersToQueryParams(filters);

      expect(result.input_account_ids).toEqual([NaN]);
      expect(result.input_category_ids).toEqual([NaN]);
      expect(result.input_group_ids).toEqual([NaN]);
    });
  });

  describe('Date Range Edge Cases', () => {
    it('should handle leap year calculations correctly', () => {
      // When in March 2024, last month (February) should have 29 days (leap year)
      vi.setSystemTime(new Date(2024, 2, 15)); // March 15, 2024
      
      const presets = getDateRangePresets();
      const lastMonth = presets.find(p => p.value === 'last_month');
      
      expect(lastMonth!.startDate.getTime()).toEqual(new Date(2024, 1, 1).getTime()); // Feb 1
      expect(lastMonth!.endDate.getTime()).toEqual(new Date(2024, 1, 29).getTime()); // Feb 29
    });

    it('should handle non-leap year calculations correctly', () => {
      // When in March 2023, last month (February) should have 28 days (not leap year)
      vi.setSystemTime(new Date(2023, 2, 15)); // March 15, 2023
      
      const presets = getDateRangePresets();
      const lastMonth = presets.find(p => p.value === 'last_month');
      
      expect(lastMonth!.startDate.getTime()).toEqual(new Date(2023, 1, 1).getTime()); // Feb 1
      expect(lastMonth!.endDate.getTime()).toEqual(new Date(2023, 1, 28).getTime()); // Feb 28
    });

    it('should handle month boundaries correctly across years', () => {
      // When in January 2024, last month should be December 2023
      vi.setSystemTime(new Date(2024, 0, 15)); // January 15, 2024
      
      const presets = getDateRangePresets();
      const lastMonth = presets.find(p => p.value === 'last_month');
      
      expect(lastMonth!.startDate.getTime()).toEqual(new Date(2023, 11, 1).getTime()); // Dec 1, 2023
      expect(lastMonth!.endDate.getTime()).toEqual(new Date(2023, 11, 31).getTime()); // Dec 31, 2023
    });
  });
});
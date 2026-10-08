import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import type { ActiveFilters } from '@/components/transactions/transaction-filter';
import { localDateFromString, localDateString } from '@/lib/date-utils';

interface UseTransactionUrlFiltersProps {
  defaultFilters: ActiveFilters;
  defaultSearch?: string;
  defaultSortBy?: string;
  defaultSortDirection?: 'asc' | 'desc';
}

export const useTransactionUrlFilters = ({ 
  defaultFilters, 
  defaultSearch = '',
  defaultSortBy = 'payment_date',
  defaultSortDirection = 'desc'
}: UseTransactionUrlFiltersProps) => {
  const [location, navigate] = useLocation();
  const [filters, setFilters] = useState<ActiveFilters>(defaultFilters);
  const [search, setSearch] = useState<string>(defaultSearch);
  const [sortBy, setSortBy] = useState<string>(defaultSortBy);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);
  const [initialLoad, setInitialLoad] = useState(true);

  // Parse URL parameters on initial load
  useEffect(() => {
    if (!initialLoad) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlFilters: ActiveFilters = { ...defaultFilters };
    let urlSearch = defaultSearch;
    
    // Parse date range
    const monthParam = urlParams.get('month');
    if (monthParam) {
      // Expected format: YYYY-MM
      const [year, month] = monthParam.split('-');
      if (year && month) {
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0); // Last day of month
        
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          urlFilters.dateRange = {
            from: startDate,
            to: endDate
          };
        }
      }
    }
    
    // Parse start and end dates (for custom ranges)
    const startDateParam = urlParams.get('startDate');
    const endDateParam = urlParams.get('endDate');
    
    // Parsed as local midnight to mirror the localDateString() used when writing these
    // params below — new Date(param) would read them as UTC and shift the whole range
    // back a day west of Greenwich.
    if (startDateParam && endDateParam) {
      const startDate = localDateFromString(startDateParam);
      const endDate = localDateFromString(endDateParam);

      if (startDate && endDate) {
        urlFilters.dateRange = {
          from: startDate,
          to: endDate
        };
      }
    }
    
    // Parse categories
    const categoryParam = urlParams.get('category');
    if (categoryParam) {
      const categoryIds = categoryParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (categoryIds.length > 0) {
        urlFilters.categories = categoryIds;
      }
    }
    
    // Parse accounts
    const accountParam = urlParams.get('account');
    if (accountParam) {
      const accountIds = accountParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (accountIds.length > 0) {
        urlFilters.accounts = accountIds;
      }
    }
    
    // Parse status
    const statusParam = urlParams.get('status');
    if (statusParam) {
      const statuses = statusParam.split(',').filter(s => s.length > 0);
      if (statuses.length > 0) {
        urlFilters.status = statuses;
      }
    }
    
    // Parse tags
    const tagParam = urlParams.get('tag');
    if (tagParam) {
      const tagIds = tagParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (tagIds.length > 0) {
        urlFilters.tags = tagIds;
      }
    }

    // Parse ignored filter
    const ignoredParam = urlParams.get('ignored');
    if (ignoredParam === 'true') {
      urlFilters.ignored = [true];
    }
    
    // Parse search
    const searchParam = urlParams.get('search');
    if (searchParam) {
      urlSearch = searchParam;
    }
    
    // Parse sort parameters
    let urlSortBy = defaultSortBy;
    let urlSortDirection = defaultSortDirection;
    
    const sortByParam = urlParams.get('sortBy');
    if (sortByParam) {
      urlSortBy = sortByParam;
    }
    
    const sortDirectionParam = urlParams.get('sortDirection');
    if (sortDirectionParam === 'asc' || sortDirectionParam === 'desc') {
      urlSortDirection = sortDirectionParam;
    }
    
    setFilters(urlFilters);
    setSearch(urlSearch);
    setSortBy(urlSortBy);
    setSortDirection(urlSortDirection);
    setInitialLoad(false);
  }, [defaultFilters, defaultSearch, defaultSortBy, defaultSortDirection, initialLoad]);

  // Update URL when filters or search change (but not on initial load)
  useEffect(() => {
    if (initialLoad) return;

    const params = new URLSearchParams();
    
    // Add date range
    if (filters.dateRange?.from) {
      const startDate = typeof filters.dateRange.from === 'string' ? new Date(filters.dateRange.from) : filters.dateRange.from;
      const endDate = filters.dateRange.to ? 
        (typeof filters.dateRange.to === 'string' ? new Date(filters.dateRange.to) : filters.dateRange.to) : 
        startDate;
      
      // Check if it's a complete month range
      const isCompleteMonth = 
        startDate.getDate() === 1 && 
        endDate.getDate() === new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate() &&
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getFullYear() === endDate.getFullYear();
      
      if (isCompleteMonth) {
        // Use month format for complete months
        const year = startDate.getFullYear();
        const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
        params.set('month', `${year}-${month}`);
      } else {
        // Use start/end date format for custom ranges
        params.set('startDate', localDateString(startDate));
        params.set('endDate', localDateString(endDate));
      }
    }
    
    // Add categories
    if (filters.categories && filters.categories.length > 0) {
      params.set('category', filters.categories.join(','));
    }
    
    // Add accounts
    if (filters.accounts && filters.accounts.length > 0) {
      params.set('account', filters.accounts.join(','));
    }

    // Add tags
    if (filters.tags && filters.tags.length > 0) {
      params.set('tag', filters.tags.join(','));
    }
    
    // Add status
    if (filters.status && filters.status.length > 0) {
      params.set('status', filters.status.join(','));
    }
    
    // Add ignored filter
    if (filters.ignored && filters.ignored.includes(true)) {
      params.set('ignored', 'true');
    }
    
    // Add search
    if (search && search.trim().length > 0) {
      params.set('search', search);
    }
    
    // Add sort parameters (only if different from defaults)
    if (sortBy !== defaultSortBy) {
      params.set('sortBy', sortBy);
    }
    if (sortDirection !== defaultSortDirection) {
      params.set('sortDirection', sortDirection);
    }

    // Only update URL if parameters changed
    const currentParams = new URLSearchParams(window.location.search).toString();
    const newParams = params.toString();
    
    if (currentParams !== newParams) {
      const newUrl = newParams ? `${location}?${newParams}` : location;
      navigate(newUrl, { replace: true });
    }
  }, [filters, search, sortBy, sortDirection, location, navigate, initialLoad, defaultSortBy, defaultSortDirection]);

  const updateFilters = (newFilters: ActiveFilters | ((current: ActiveFilters) => ActiveFilters)) => {
    if (typeof newFilters === 'function') {
      setFilters(current => newFilters(current));
    } else {
      setFilters(newFilters);
    }
  };

  const updateSearch = (newSearch: string) => {
    setSearch(newSearch);
  };

  const updateSort = (newSortBy: string, newSortDirection: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortDirection(newSortDirection);
  };

  return { 
    filters, 
    search, 
    sortBy, 
    sortDirection, 
    updateFilters, 
    updateSearch, 
    updateSort 
  };
};
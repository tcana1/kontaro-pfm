import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { localDateFromString, localDateString } from '@/lib/date-utils';

interface FilterState {
  startDate: Date;
  endDate: Date;
  accountIds: string[];
  categoryIds: string[];
  groupIds: string[];
  excludeTagIds: string[];
}

interface UseUrlFiltersProps {
  defaultFilters: FilterState;
}

export const useUrlFilters = ({ defaultFilters }: UseUrlFiltersProps) => {
  const [location, navigate] = useLocation();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasUrlParams, setHasUrlParams] = useState(false);

  // Parse URL parameters on initial load
  useEffect(() => {
    if (!initialLoad) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlFilters = { ...defaultFilters };
    let foundParams = false;
    
    // Check for range parameter first
    const rangeParam = urlParams.get('range');
    if (rangeParam === 'allTime') {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      urlFilters.startDate = new Date(1900, 0, 1);
      urlFilters.endDate = new Date(currentYear, currentMonth, now.getDate());
      foundParams = true;
    } else {
      // Parse individual dates
      const startDateParam = urlParams.get('startDate');
      const endDateParam = urlParams.get('endDate');
      
      // Parsed as local midnight to mirror the localDateString() used when writing
      // these params below — new Date(param) would read them as UTC and shift the
      // whole filter back a day west of Greenwich.
      if (startDateParam) {
        const startDate = localDateFromString(startDateParam);
        if (startDate) {
          urlFilters.startDate = startDate;
          foundParams = true;
        }
      }

      if (endDateParam) {
        const endDate = localDateFromString(endDateParam);
        if (endDate) {
          urlFilters.endDate = endDate;
          foundParams = true;
        }
      }
    }
    
    // Parse other filters
    const accountParam = urlParams.get('account');
    if (accountParam) {
      urlFilters.accountIds = accountParam.split(',');
      foundParams = true;
    }
    
    const categoryParam = urlParams.get('category');
    if (categoryParam) {
      urlFilters.categoryIds = categoryParam.split(',');
      foundParams = true;
    }
    
    const groupParam = urlParams.get('group');
    if (groupParam) {
      urlFilters.groupIds = groupParam.split(',');
      foundParams = true;
    }

    const excludeTagParam = urlParams.get('excludeTag');
    if (excludeTagParam) {
      urlFilters.excludeTagIds = excludeTagParam.split(',');
      foundParams = true;
    }

    setHasUrlParams(foundParams);
    setFilters(urlFilters);
    setInitialLoad(false);
  }, [defaultFilters, initialLoad]);

  // Update URL when filters change (but not on initial load)
  useEffect(() => {
    if (initialLoad) return;

    const params = new URLSearchParams();
    
    // Check if this is the "All Time" range (starts from 1900)
    const isAllTimeRange = filters.startDate.getTime() === new Date(1900, 0, 1).getTime();
    
    // Check if this is the default date range for the current tab
    const isDefaultDateRange = 
      filters.startDate.getTime() === defaultFilters.startDate.getTime() && 
      filters.endDate.getTime() === defaultFilters.endDate.getTime();
    
    // Only skip URL params for defaults if we never had URL params (fresh load with tab defaults)
    // If we had URL params, always persist the selection even if it matches a tab default
    if (isAllTimeRange && (hasUrlParams || !isDefaultDateRange)) {
      // Use clean "range=allTime" parameter instead of ugly dates
      // Only persist All Time if user made explicit selections OR it's not the current tab's default
      params.set('range', 'allTime');
    } else if (hasUrlParams || !isDefaultDateRange) {
      // Persist dates if: user made explicit selections OR it's not the default
      params.set('startDate', localDateString(filters.startDate));
      params.set('endDate', localDateString(filters.endDate));
    }
    
    if (filters.accountIds && !filters.accountIds.includes('all') && filters.accountIds.length > 0) {
      params.set('account', filters.accountIds.join(','));
    }
    
    if (filters.categoryIds && !filters.categoryIds.includes('all') && filters.categoryIds.length > 0) {
      params.set('category', filters.categoryIds.join(','));
    }
    
    if (filters.groupIds && !filters.groupIds.includes('all') && filters.groupIds.length > 0) {
      params.set('group', filters.groupIds.join(','));
    }

    if (filters.excludeTagIds && filters.excludeTagIds.length > 0) {
      params.set('excludeTag', filters.excludeTagIds.join(','));
    }

    // Only update URL if parameters changed
    const currentParams = new URLSearchParams(window.location.search).toString();
    const newParams = params.toString();
    
    if (currentParams !== newParams) {
      const newUrl = newParams ? `${location}?${newParams}` : location;
      navigate(newUrl, { replace: true });
    }
  }, [filters, defaultFilters, location, navigate, initialLoad, hasUrlParams]);

  const updateFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
    setHasUrlParams(true); // Mark that user has made explicit selections
  };

  return { filters, updateFilters };
};
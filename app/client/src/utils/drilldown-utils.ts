import { localDateString } from '@/lib/date-utils';

/**
 * Utility functions for drilling down from reports to transactions
 */

interface DrilldownParams {
  month?: string; // YYYY-MM format
  categoryId?: number;
  categoryIds?: number[]; // Support multiple category IDs
  groupId?: number;
  accountIds?: number[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

/**
 * Generate a transaction page URL with appropriate filters for drilldown
 */
export const generateTransactionUrl = (params: DrilldownParams): string => {
  const urlParams = new URLSearchParams();
  
  // Add date filters
  if (params.month) {
    urlParams.set('month', params.month);
  } else if (params.startDate && params.endDate) {
    urlParams.set('startDate', localDateString(params.startDate));
    urlParams.set('endDate', localDateString(params.endDate));
  }
  
  // Add category filter
  if (params.categoryIds && params.categoryIds.length > 0) {
    urlParams.set('category', params.categoryIds.join(','));
  } else if (params.categoryId) {
    urlParams.set('category', params.categoryId.toString());
  }
  
  // Add account filters
  if (params.accountIds && params.accountIds.length > 0) {
    urlParams.set('account', params.accountIds.join(','));
  }
  
  // Add search/payee filter
  if (params.search) {
    urlParams.set('search', params.search);
  }

  // Add sort parameters
  if (params.sortBy) {
    urlParams.set('sortBy', params.sortBy);
  }
  if (params.sortDirection) {
    urlParams.set('sortDirection', params.sortDirection);
  }
  
  // Always exclude ignored transactions (matching reports behavior)
  urlParams.set('status', 'Pending,Cleared');
  
  const baseUrl = '/transactions';
  return urlParams.toString() ? `${baseUrl}?${urlParams.toString()}` : baseUrl;
};

/**
 * Extract month from a date string or Date object
 * Returns YYYY-MM format
 */
export const extractMonthFromDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Open transaction drilldown in a new tab
 */
export const openTransactionDrilldown = (params: DrilldownParams) => {
  // Clean up undefined values to avoid them appearing in URLs
  const cleanParams: DrilldownParams = {};
  
  if (params.month) cleanParams.month = params.month;
  if (params.categoryId) cleanParams.categoryId = params.categoryId;
  if (params.categoryIds && params.categoryIds.length > 0) cleanParams.categoryIds = params.categoryIds;
  if (params.groupId) cleanParams.groupId = params.groupId;
  if (params.accountIds && params.accountIds.length > 0) cleanParams.accountIds = params.accountIds;
  if (params.startDate) cleanParams.startDate = params.startDate;
  if (params.endDate) cleanParams.endDate = params.endDate;
  if (params.search) cleanParams.search = params.search;
  if (params.sortBy) cleanParams.sortBy = params.sortBy;
  if (params.sortDirection) cleanParams.sortDirection = params.sortDirection;
  
  const url = generateTransactionUrl(cleanParams);
  window.open(url, '_blank');
};
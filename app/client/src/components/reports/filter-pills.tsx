import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { XIcon } from 'lucide-react';
import { useFinance } from '@/contexts/finance-context';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { formatDateForDisplay } from '@/lib/date-utils';
import type { Tag } from '@shared/schema';

interface FilterPillsProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
  onRemoveFilter: (filterType: 'account' | 'category' | 'group' | 'dateRange' | 'excludeTag' | 'clearAll') => void;
  activeTab: string;
}

const FilterPills: React.FC<FilterPillsProps> = ({ filters, onRemoveFilter, activeTab }) => {
  const { t } = useTranslation();
  const { accounts = [], categories = [], categoryGroups = [], locale, dateFormat } = useFinance();
  const { data: tags = [] } = useServiceQuery<Tag[]>('tags');
  
  const pills: Array<{
    id: string;
    label: string;
    onRemove: () => void;
    color?: string;
    isDateRange?: boolean;
  }> = [];

  // Get tab-specific default date ranges
  const getTabDefaultDates = (tab: string) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    switch (tab) {
      case 'breakdown':
        // Last Month
        return {
          startDate: new Date(currentYear, currentMonth - 1, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      case 'trends':
        // Last 12 Months
        return {
          startDate: new Date(currentYear, currentMonth - 12, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      case 'incomevsexpenses':
        // This Year
        return {
          startDate: new Date(currentYear, 0, 1),
          endDate: currentMonth === 0 
            ? new Date(currentYear - 1, 11, 31) // If January, show last year's December
            : new Date(currentYear, currentMonth, 0) // Last complete month
        };
      default:
        return {
          startDate: new Date(currentYear, currentMonth - 1, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
    }
  };

  // Check if date range is not the tab-specific default
  const tabDefaults = getTabDefaultDates(activeTab);
  const isDefaultDateRange = 
    filters.startDate.getTime() === tabDefaults.startDate.getTime() && 
    filters.endDate.getTime() === tabDefaults.endDate.getTime();

  if (!isDefaultDateRange) {
    const isAllTimeRange = filters.startDate.getTime() === new Date(1900, 0, 1).getTime();
    
    const dateRangeLabel = isAllTimeRange
      ? t('All Time')
      : `${formatDateForDisplay(filters.startDate, locale, dateFormat)} - ${formatDateForDisplay(filters.endDate, locale, dateFormat)}`;
    
    pills.push({
      id: 'dateRange',
      label: dateRangeLabel,
      onRemove: () => onRemoveFilter('dateRange'),
      isDateRange: true
    });
  }

  // Account filter
  if (!filters.accountIds.includes('all') && filters.accountIds.length > 0) {
    if (filters.accountIds.length === 1) {
      const account = accounts.find(a => a.id.toString() === filters.accountIds[0]);
      if (account) {
        pills.push({
          id: 'account',
          label: account.name,
          onRemove: () => onRemoveFilter('account')
        });
      }
    } else {
      pills.push({
        id: 'account',
        label: t('{{count}} Accounts', { count: filters.accountIds.length }),
        onRemove: () => onRemoveFilter('account')
      });
    }
  }

  // Category Group filter
  if (!filters.groupIds.includes('all') && filters.groupIds.length > 0) {
    if (filters.groupIds.length === 1) {
      const group = categoryGroups.find(g => g.id.toString() === filters.groupIds[0]);
      if (group) {
        pills.push({
          id: 'group',
          label: `${group.emoji ? group.emoji + ' ' : ''}${group.name}`,
          onRemove: () => onRemoveFilter('group')
        });
      }
    } else {
      pills.push({
        id: 'group',
        label: t('{{count}} Groups', { count: filters.groupIds.length }),
        onRemove: () => onRemoveFilter('group')
      });
    }
  }

  // Category filter
  if (!filters.categoryIds.includes('all') && filters.categoryIds.length > 0) {
    if (filters.categoryIds.length === 1) {
      const category = categories.find(c => c.id.toString() === filters.categoryIds[0]);
      if (category) {
        pills.push({
          id: 'category',
          label: category.name,
          onRemove: () => onRemoveFilter('category'),
          color: category.color ?? undefined
        });
      }
    } else {
      pills.push({
        id: 'category',
        label: t('{{count}} Categories', { count: filters.categoryIds.length }),
        onRemove: () => onRemoveFilter('category')
      });
    }
  }

  // Excluded tags pills
  if (filters.excludeTagIds && filters.excludeTagIds.length > 0) {
    filters.excludeTagIds.forEach(tagId => {
      const tag = tags.find(t => t.id.toString() === tagId);
      if (tag) {
        pills.push({
          id: `excludeTag-${tagId}`,
          label: t('Excl. {{name}}', { name: tag.name }),
          onRemove: () => onRemoveFilter('excludeTag'),
          color: tag.color,
        });
      }
    });
  }

  // Add "Clear All" pill if there are any active filters
  if (pills.length > 1) {
    pills.push({
      id: 'clearAll',
      label: t('Clear All'),
      onRemove: () => onRemoveFilter('clearAll')
    });
  }

  return (
    <div className="flex flex-wrap gap-2 min-h-6">
      {pills.map((pill) => (
        <Badge
          key={pill.id}
          variant={pill.id === 'clearAll' ? 'destructive' : 'secondary'}
          className={`h-6 px-2 text-xs flex items-center gap-1 cursor-pointer ${
            pill.id === 'clearAll' 
              ? 'hover:bg-red-600 dark:hover:bg-red-700' 
              : 'hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          onClick={pill.onRemove}
        >
          <span className={`truncate ${pill.isDateRange ? 'max-w-[200px]' : 'max-w-[120px]'}`}>{pill.label}</span>
          <XIcon className="h-3 w-3 ml-1" />
        </Badge>
      ))}
    </div>
  );
};

export default FilterPills;
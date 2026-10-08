import React from 'react';
import { useTranslation } from 'react-i18next';
import DateRangeSelector from './date-range-selector';
import DatePresetButtons from './date-preset-buttons';
import FilterPills from './filter-pills';
import { Button } from '@/components/ui/button';
import MultiSelect from '@/components/ui/multi-select';
import { useFinance } from '@/contexts/finance-context';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { cn } from '@/lib/utils';
import type { Tag } from '@shared/schema';

interface ReportFiltersProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
  onChange: (filters: any) => void;
  activeTab: string;
}

const ReportFilters: React.FC<ReportFiltersProps> = ({ filters, onChange, activeTab }) => {
  const { t } = useTranslation();
  const { accounts = [], categories = [], categoryGroups = [] } = useFinance();
  const { data: tags = [] } = useServiceQuery<Tag[]>('tags');
  
  // Filter out income categories for expense reports
  const expenseCategories = categories.filter(cat => !cat.category_groups?.is_income);
  
  const handleDateRangeChange = (startDate: Date, endDate: Date) => {
    onChange({
      ...filters,
      startDate,
      endDate
    });
  };
  
  const handleAccountChange = (accountIds: string[]) => {
    onChange({
      ...filters,
      accountIds
    });
  };
  
  const handleCategoryChange = (categoryIds: string[]) => {
    onChange({
      ...filters,
      categoryIds
    });
  };
  
  const handleGroupChange = (groupIds: string[]) => {
    onChange({
      ...filters,
      groupIds
    });
  };

  const handleTagInclusionChange = (includedTagIds: string[]) => {
    // MultiSelect gives us which tags are "included"; we store the inverse as excludeTagIds
    const allTagIds = (tags as Tag[]).map(t => t.id.toString());
    const excluded = includedTagIds.includes('all')
      ? []
      : allTagIds.filter(id => !includedTagIds.includes(id));
    onChange({ ...filters, excludeTagIds: excluded });
  };
  
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
          endDate: new Date(currentYear, currentMonth, now.getDate())
        };
      default:
        return {
          startDate: new Date(currentYear, currentMonth - 1, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
    }
  };

  const handleRemoveFilter = (filterType: 'account' | 'category' | 'group' | 'dateRange' | 'excludeTag' | 'clearAll') => {
    if (filterType === 'clearAll') {
      // Reset all filters to tab-specific defaults
      const tabDefaults = getTabDefaultDates(activeTab);
      onChange({
        ...tabDefaults,
        accountIds: ['all'],
        categoryIds: ['all'],
        groupIds: ['all'],
        excludeTagIds: [],
      });
      return;
    }
    
    switch (filterType) {
      case 'account':
        handleAccountChange(['all']);
        break;
      case 'category':
        handleCategoryChange(['all']);
        break;
      case 'group':
        handleGroupChange(['all']);
        break;
      case 'excludeTag':
        handleTagInclusionChange([]);
        break;
      case 'dateRange':
        // Reset to tab-specific default date range
        const tabDefaults = getTabDefaultDates(activeTab);
        handleDateRangeChange(tabDefaults.startDate, tabDefaults.endDate);
        break;
    }
  };
  
  return (
    <div className="space-y-3">
      {/* Row 1: Date Picker + Other Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeSelector
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={handleDateRangeChange}
        />
        
        {/* Account Filter */}
        <MultiSelect
          options={accounts.map(account => ({
            id: account.id.toString(),
            name: account.name
          }))}
          selectedIds={filters.accountIds}
          onChange={handleAccountChange}
          placeholder={t('All Accounts')}
          allLabel={t('All Accounts')}
          searchPlaceholder={t('Search accounts...')}
        />
        
        {/* Group Filter */}
        <MultiSelect
          options={categoryGroups
            .filter(group => group.id > -2) // Remove system groups
            .sort((a, b) => {
              // Uncategorized (id: 0) goes last
              if (a.id === 0 && b.id !== 0) return 1;
              if (b.id === 0 && a.id !== 0) return -1;
              // Alphabetical order for the rest
              return a.name.localeCompare(b.name);
            })
            .map(group => ({
              id: group.id.toString(),
              name: group.name,
              emoji: group.emoji ?? undefined,
              color: group.color ?? undefined
            }))}
          selectedIds={filters.groupIds}
          onChange={handleGroupChange}
          placeholder={t('All Groups')}
          allLabel={t('All Groups')}
          searchPlaceholder={t('Search groups...')}
        />
        
        {/* Tag Filter */}
        {(tags as Tag[]).length > 0 && (
          <MultiSelect
            options={[...tags as Tag[]].sort((a, b) => a.name.localeCompare(b.name)).map(tag => ({
              id: tag.id.toString(),
              name: tag.name,
              color: tag.color,
            }))}
            selectedIds={
              filters.excludeTagIds.length === 0
                ? ['all']
                : (tags as Tag[]).map(t => t.id.toString()).filter(id => !filters.excludeTagIds.includes(id))
            }
            onChange={handleTagInclusionChange}
            placeholder={t('All Tags')}
            allLabel={t('All Tags')}
            searchPlaceholder={t('Search tags...')}
          />
        )}

        {/* Category Filter */}
        <MultiSelect
          options={expenseCategories
            .filter(cat => cat.id > -2) // Remove system categories
            .filter(cat => filters.groupIds.includes('all') || filters.groupIds.includes(cat.group_id.toString()))
            .sort((a, b) => {
              // Uncategorized (id: 0) goes last
              if (a.id === 0 && b.id !== 0) return 1;
              if (b.id === 0 && a.id !== 0) return -1;
              // Alphabetical order for the rest
              return a.name.localeCompare(b.name);
            })
            .map(category => ({
              id: category.id.toString(),
              name: category.name,
              color: category.color ?? undefined
            }))}
          selectedIds={filters.categoryIds}
          onChange={handleCategoryChange}
          placeholder={t('All Categories')}
          allLabel={t('All Categories')}
          searchPlaceholder={t('Search categories...')}
        />
      </div>
      
      {/* Row 2: Date Preset Buttons */}
      <DatePresetButtons
        onPresetSelect={handleDateRangeChange}
        selectedStartDate={filters.startDate}
        selectedEndDate={filters.endDate}
      />
      
      {/* Row 3: Filter Pills */}
      <FilterPills
        filters={filters}
        onRemoveFilter={handleRemoveFilter}
        activeTab={activeTab}
      />
    </div>
  );
};

export default ReportFilters;

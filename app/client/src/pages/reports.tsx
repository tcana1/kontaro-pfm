
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMobileHeader } from '@/contexts/mobile-header-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';
import SpendingBreakdownReport from '@/components/reports/spending-breakdown-report';
import SpendingTrendsReport from '@/components/reports/spending-trends-report';
import MultiYearIncomeVsExpensesReport from '@/components/reports/multi-year-income-vs-expenses-report';
import CategoryRankingReport from '@/components/reports/category-ranking-report';
import WeekdayHeatmapReport from '@/components/reports/weekday-heatmap-report';
import MerchantScatterReport from '@/components/reports/merchant-scatter-report';
import DeepDiveReport from '@/components/reports/deep-dive-report';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReportFilters from '@/components/reports/report-filters';
import { useUrlFilters } from '@/hooks/use-url-filters';

const Reports: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = React.useState('trends');

  useMobileHeader(() => (
    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('Reports')}</span>
  ), []);
  
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
      case 'ranking':
        // Last 2 years for comparison
        return {
          startDate: new Date(currentYear - 1, 0, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      case 'heatmap':
        // Last 12 months
        return {
          startDate: new Date(currentYear, currentMonth - 12, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      case 'scatter':
        // Last 12 months
        return {
          startDate: new Date(currentYear, currentMonth - 12, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      case 'deep-dive':
        // Last 12 months
        return {
          startDate: new Date(currentYear, currentMonth - 12, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      default:
        return {
          startDate: new Date(currentYear, currentMonth - 1, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
    }
  };

  const defaultFilters = {
    ...getTabDefaultDates(activeTab),
    accountIds: ['all'],
    categoryIds: ['all'],
    groupIds: ['all'],
    excludeTagIds: [],
  };

  const { filters, updateFilters } = useUrlFilters({ defaultFilters });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleFilterChange = (newFilters: typeof filters) => {
    updateFilters(newFilters);
  };

  const activeFilterCount = [
    filters.accountIds?.includes('all') ? 0 : (filters.accountIds?.length ?? 0),
    filters.categoryIds?.includes('all') ? 0 : (filters.categoryIds?.length ?? 0),
    filters.groupIds?.includes('all') ? 0 : (filters.groupIds?.length ?? 0),
    filters.excludeTagIds?.length ?? 0,
  ].reduce((a, b) => a + b, 0);
  
  const handleTabChange = (newTab: string) => {
    if (newTab !== activeTab) {
      setActiveTab(newTab);
      
      // Only reset to tab defaults if there are no existing URL parameters
      // This preserves user-selected date ranges when switching tabs
      const urlParams = new URLSearchParams(window.location.search);
      const hasDateParams = urlParams.has('startDate') || urlParams.has('endDate') || urlParams.has('range');
      
      if (!hasDateParams) {
        // No URL date parameters, use tab-specific defaults
        const newTabDefaults = {
          ...getTabDefaultDates(newTab),
          accountIds: filters.accountIds,
          categoryIds: filters.categoryIds,
          groupIds: filters.groupIds,
          excludeTagIds: filters.excludeTagIds,
        };
        updateFilters(newTabDefaults);
      }
      // If URL params exist, the useUrlFilters hook will handle maintaining them
    }
  };

  return (
    <div className="space-y-6">
      <div className="hidden md:block">
        <h1 className="text-2xl font-semibold">{t('Reports')}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('Analyze your financial data')}</p>
      </div>
      
      {/* Mobile: collapsible filter toggle */}
      <div className="md:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full flex items-center justify-between"
          onClick={() => setFiltersOpen(v => !v)}
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {t('Filters')}
            {activeFilterCount > 0 && (
              <span className="h-5 w-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs">
                {activeFilterCount}
              </span>
            )}
          </span>
          {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {filtersOpen && (
          <Card className="border border-gray-200 dark:border-gray-700 p-4 mt-2">
            <ReportFilters
              filters={filters}
              onChange={handleFilterChange}
              activeTab={activeTab}
            />
          </Card>
        )}
      </div>

      {/* Desktop: always visible */}
      <Card className="hidden md:block border border-gray-200 dark:border-gray-700 p-4">
        <ReportFilters
          filters={filters}
          onChange={handleFilterChange}
          activeTab={activeTab}
        />
      </Card>
      
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Mobile: dropdown tab selector */}
        <div className="sm:hidden mb-6">
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trends">{t('Spending Trends')}</SelectItem>
              <SelectItem value="breakdown">{t('Spending Breakdown')}</SelectItem>
              <SelectItem value="ranking">{t('Ranking')}</SelectItem>
              <SelectItem value="heatmap">{t('Weekday Heatmap')}</SelectItem>
              <SelectItem value="scatter">{t('Merchant Scatter')}</SelectItem>
              <SelectItem value="deep-dive">{t('Deep Dive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: tab strip */}
        <TabsList className="hidden sm:grid grid-cols-6 mb-6">
          <TabsTrigger value="trends">{t('Spending Trends')}</TabsTrigger>
          <TabsTrigger value="breakdown">{t('Spending Breakdown')}</TabsTrigger>
          <TabsTrigger value="ranking">{t('Ranking')}</TabsTrigger>
          <TabsTrigger value="heatmap">{t('Weekday Heatmap')}</TabsTrigger>
          <TabsTrigger value="scatter">{t('Merchant Scatter')}</TabsTrigger>
          <TabsTrigger value="deep-dive">{t('Deep Dive')}</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="mt-0">
          <SpendingTrendsReport filters={filters} />
        </TabsContent>

        <TabsContent value="breakdown" className="mt-0">
          <SpendingBreakdownReport filters={filters} />
        </TabsContent>

        <TabsContent value="incomevsexpenses" className="mt-0">
          <MultiYearIncomeVsExpensesReport filters={filters} />
        </TabsContent>

        <TabsContent value="ranking" className="mt-0">
          <CategoryRankingReport filters={filters} />
        </TabsContent>

        <TabsContent value="heatmap" className="mt-0">
          <WeekdayHeatmapReport filters={filters} />
        </TabsContent>

        <TabsContent value="scatter" className="mt-0">
          <MerchantScatterReport filters={filters} />
        </TabsContent>

        <TabsContent value="deep-dive" className="mt-0">
          <DeepDiveReport filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;

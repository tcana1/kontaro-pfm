import React, { useState, useEffect } from "react";
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { roundDown } from "@/lib/currency-formatter";
import { useMoney } from '@/hooks/useMoney';
import { formatDateRangeLabel, localDateString } from "@/lib/date-utils";
import { openTransactionDrilldown } from "@/utils/drilldown-utils";
import { supabaseService } from "@/services/supabase-service";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getDbFilterArray } from "@/lib/report-filters";
import { ChartLoadingState, ChartEmptyState } from "./chart-states";

interface CategoryRankingReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
}

type YearData = {
  rank: number;
  total: number;
  average_monthly: number;
  percentage: number;
  months_elapsed: number;
};

type CategoryRankingData = {
  category_name: string;
  category_emoji: string;
  category_color: string;
  years: Record<string, YearData>;
};

type TopMerchant = {
  payee: string;
  total_spent: number;
  visit_count: number;
};

type MerchantLoadState = "idle" | "loading" | "loaded";
type MerchantCache = Map<string, TopMerchant[]>;
type MerchantLoadStates = Map<string, MerchantLoadState>;

const CategoryRankingReport: React.FC<CategoryRankingReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const { categories, locale, dateFormat } = useFinance();
  const money = useMoney();
  const [rankingData, setRankingData] = useState<CategoryRankingData[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('recent_year');

  // Merchant drill-down state — keyed by category name
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [merchantCache, setMerchantCache] = useState<MerchantCache>(new Map());
  const [merchantLoadStates, setMerchantLoadStates] = useState<MerchantLoadStates>(new Map());

  // Format date range for display
  const dateRangeText = (() => {
    return formatDateRangeLabel(filters.startDate, filters.endDate, locale, dateFormat, t('All Time'));
  })();

  // Fetch ranking data
  const queryParams = {
    start_date: localDateString(filters.startDate),
    end_date: localDateString(filters.endDate),
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
    input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
    sort_by: sortBy,
  };
  
  const { data, isLoading } = useServiceQuery("get_category_ranking", {
    rawQuery: true,
    queryParams: queryParams,
  });

  // Process data when it changes
  useEffect(() => {
    if (!data || !Array.isArray(data)) {
      return;
    }

    // Extract all available years from the data
    const yearsSet = new Set<string>();
    data.forEach((item: CategoryRankingData) => {
      if (item.years) {
        Object.keys(item.years).forEach(year => yearsSet.add(year));
      }
    });
    
    const sortedYears = Array.from(yearsSet).sort();
    setAvailableYears(sortedYears);
    setRankingData(data);
  }, [data]);

  // Calculate cumulative percentages for each year
  const calculateCumulativePercentages = (year: string) => {
    let cumulative = 0;
    return rankingData.map(category => {
      const yearData = category.years[year];
      if (yearData) {
        cumulative += yearData.percentage;
        return { ...category, cumulativePercentage: cumulative };
      }
      return { ...category, cumulativePercentage: cumulative };
    });
  };

  // Handle double-click on table row for drilldown
  const handleRowDoubleClick = (categoryName: string) => {
    // Find the category ID by matching the category name
    const category = categories?.find(c => c.name === categoryName);
    if (!category) return;

    // Convert filter arrays to database format for account filtering
    const accountIds = getDbFilterArray(filters.accountIds) ?? [];

    openTransactionDrilldown({
      startDate: filters.startDate,
      endDate: filters.endDate,
      categoryId: category.id,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      sortBy: 'amount',
      sortDirection: 'asc'
    });
  };

  const handleChevronClick = async (categoryName: string) => {
    // Toggle collapse if already expanded
    if (expandedCategory === categoryName) {
      setExpandedCategory(null);
      return;
    }

    setExpandedCategory(categoryName);

    // All years already cached — nothing to fetch
    const allCached = availableYears.every(y => merchantCache.has(`${categoryName}|${y}`));
    if (allCached) return;

    const category = categories?.find(c => c.name === categoryName);
    if (!category) return;

    setMerchantLoadStates(prev => new Map(prev).set(categoryName, "loading"));

    try {
      const accountIds = filters.accountIds.includes('all') || filters.accountIds.length === 0
        ? null
        : filters.accountIds.map(id => parseInt(id, 10));

      // Fetch top merchants for each year in parallel
      await Promise.all(availableYears.map(async (year) => {
        if (merchantCache.has(`${categoryName}|${year}`)) return;

        // Clamp to the year boundaries while respecting the overall filter range
        const yearStart = Math.max(
          new Date(`${year}-01-01`).getTime(),
          filters.startDate.getTime(),
        );
        const yearEnd = Math.min(
          new Date(`${year}-12-31`).getTime(),
          filters.endDate.getTime(),
        );

        const result = await supabaseService.rpc('get_top_merchants_for_category', {
          input_category_id: category.id,
          start_date: localDateString(new Date(yearStart)),
          end_date:   localDateString(new Date(yearEnd)),
          input_account_ids: accountIds,
          limit_n: 5,
        });

        const merchants = Array.isArray(result) ? result as TopMerchant[] : [];
        setMerchantCache(prev => new Map(prev).set(`${categoryName}|${year}`, merchants));
      }));

      setMerchantLoadStates(prev => new Map(prev).set(categoryName, "loaded"));
    } catch (err) {
      console.error('[CategoryRanking] Failed to load top merchants:', err);
      setMerchantLoadStates(prev => new Map(prev).set(categoryName, "idle"));
    }
  };

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">{t('Category Ranking')}</CardTitle>
        <p className="text-sm text-gray-500">{dateRangeText}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ChartLoadingState />
        ) : !rankingData || rankingData.length === 0 ? (
          <ChartEmptyState message={t('No ranking data available for the selected filters')} />
        ) : (
          <div className="space-y-6">
            {/* Sort Options */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <label htmlFor="sort-select" className="text-sm font-medium">
                  {t('Sort by:')}
                </label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="recent_year">{t('Most Recent Year')}</option>
                  <option value="average_rank">{t('Average Rank')}</option>
                  <option value="highest_total">{t('Highest Total')}</option>
                  <option value="alphabetical">{t('Alphabetical')}</option>
                </select>
              </div>
            </div>

            {/* Ranking Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-2 font-medium">{t('Category')}</th>
                    {availableYears.map((year, index) => (
                      <React.Fragment key={year}>
                        <th className={`text-center py-3 px-2 font-medium ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`} colSpan={5}>
                          {year}
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                    <th></th>
                    {availableYears.map((year, index) => (
                      <React.Fragment key={year}>
                        <th className={`text-center py-2 px-1 ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}>{t('Rank')}</th>
                        <th className="text-center py-2 px-1">{t('Total')}</th>
                        <th className="text-center py-2 px-1">{t('Avg. Mo.')}</th>
                        <th className="text-center py-2 px-1">%</th>
                        <th className="text-center py-2 px-1">{t('% Tot.')}</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {availableYears.map(year => calculateCumulativePercentages(year)).reduce((acc, yearData) => {
                    if (acc.length === 0) {
                      // Initialize with first year's data
                      return yearData.map(category => ({
                        category,
                        yearDataMap: { [availableYears[0]]: category }
                      }));
                    }
                    // Merge subsequent years
                    return acc.map((item: any, idx: number) => ({
                      ...item,
                      yearDataMap: {
                        ...item.yearDataMap,
                        [availableYears[Math.floor(idx / acc.length) + 1]]: yearData[idx]
                      }
                    }));
                  }, [] as any)[0] ? 
                  
                  rankingData.map((category, idx) => {
                    // Calculate cumulative percentages for each year
                    const cumulativesByYear: Record<string, number> = {};
                    
                    availableYears.forEach(year => {
                      let cumulative = 0;
                      for (let i = 0; i <= idx; i++) {
                        const catData = rankingData[i].years[year];
                        if (catData) {
                          cumulative += catData.percentage;
                        }
                      }
                      cumulativesByYear[year] = cumulative;
                    });

                    const isExpanded = expandedCategory === category.category_name;
                    const loadState = merchantLoadStates.get(category.category_name) ?? "idle";

                    return (
                      <React.Fragment key={category.category_name}>
                      <tr
                        className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer touch-manipulation"
                        {...bindDoubleTap(() => handleRowDoubleClick(category.category_name))}
                      >
                        <td className="py-2 px-2 font-medium">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleChevronClick(category.category_name); }}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-muted-foreground"
                              title={t('Show top merchants')}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.category_color }}
                            ></span>
                            <span>{category.category_emoji}</span>
                            {category.category_name}
                          </div>
                        </td>
                        {availableYears.map((year, index) => {
                          const yearData = category.years[year];
                          const cumulative = cumulativesByYear[year];
                          
                          return (
                            <React.Fragment key={year}>
                              <td className={`text-center py-2 px-1 ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}>
                                {yearData ? yearData.rank : '-'}
                              </td>
                              <td className="text-center py-2 px-1">
                                {yearData ? money(roundDown(yearData.total), { precision: 0 }) : '-'}
                              </td>
                              <td className="text-center py-2 px-1">
                                {yearData ? money(roundDown(yearData.average_monthly), { precision: 0 }) : '-'}
                              </td>
                              <td className="text-center py-2 px-1">
                                {yearData ? `${yearData.percentage.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '-'}
                              </td>
                              <td className="text-center py-2 px-1">
                                {yearData ? `${cumulative.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '-'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>

                      {/* Merchant sub-row — only rendered when expanded */}
                      {isExpanded && (
                        <tr className="bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700">
                          {/* Empty category cell to preserve column alignment */}
                          <td className="py-2 px-2" />
                          {loadState === "loading" ? (
                            <td colSpan={availableYears.length * 5} className="py-2 px-2">
                              <p className="text-xs text-muted-foreground">{t('Loading top merchants…')}</p>
                            </td>
                          ) : (
                            availableYears.map((year, yIdx) => {
                              const yearMerchants = merchantCache.get(`${category.category_name}|${year}`) ?? [];
                              return (
                                <td
                                  key={year}
                                  colSpan={5}
                                  className={`py-2 px-2 align-top ${yIdx > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}
                                >
                                  <p className="text-xs font-semibold text-muted-foreground mb-1">{year}</p>
                                  {yearMerchants.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">—</p>
                                  ) : (
                                    yearMerchants.map((m, i) => (
                                      <div key={m.payee} className="flex items-baseline justify-between gap-2 text-xs py-0.5">
                                        <span className="flex items-baseline gap-1 min-w-0">
                                          <span className="text-muted-foreground shrink-0">#{i + 1}</span>
                                          <span className="font-medium truncate">{m.payee}</span>
                                        </span>
                                        <span className="text-muted-foreground shrink-0">
                                          {money(m.total_spent, { precision: 0 })}
                                          <span className="text-muted-foreground/60"> · {m.visit_count}×</span>
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  }) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CategoryRankingReport;
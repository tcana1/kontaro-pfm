import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinance } from "@/contexts/finance-context";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-formatter";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { CategoryGroup, Category, Transaction } from "@shared/schema";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { openTransactionDrilldown } from "@/utils/drilldown-utils";
import { formatDateRangeLabel, localDateString } from "@/lib/date-utils";

interface SpendingBreakdownReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
}

const SpendingBreakdownReport: React.FC<SpendingBreakdownReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const { currency, categories, categoryGroups, locale: userLocale, dateFormat } = useFinance();
  const [drilldownId, setDrilldownId] = useState<string | null>(null);
  const [drilldownName, setDrilldownName] = useState<string | null>(null);

  const { user } = useAuth();
  type ExpenseBreakdownItem = {
    value: number;
    label: string;
    group_id: string;
    color: string;
    unique_months: number;
  };

  // Convert filter arrays to database format
  const getDbFilterArray = (filterArray: string[]) => {
    if (filterArray.includes('all') || filterArray.length === 0) {
      return null;
    }
    return filterArray.map(id => parseInt(id, 10));
  };

  const { data: spendingData = [], isLoading } = useServiceQuery<ExpenseBreakdownItem[]>("get_expense_breakdown", {
    rawQuery: true,
    queryParams: {
      start_date: localDateString(filters.startDate),
      end_date: localDateString(filters.endDate),
      input_group_ids: drilldownId ? [parseInt(drilldownId, 10)] : getDbFilterArray(filters.groupIds),
      input_account_ids: getDbFilterArray(filters.accountIds),
      input_category_ids: getDbFilterArray(filters.categoryIds),
      input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
    },
  });

  // Process data for chart
  const chartData = useMemo(() => {
    if (!spendingData.length) return null;

    // Sort data by value descending
    const sortedData = [...spendingData].sort((a, b) => a.value - b.value);

    const slices = sortedData.map(d => ({
      name: d.label,
      value: (d.value * -1) || 0, // Ensure no NaN values
      color: d.color,
      groupId: d.group_id,
    }));
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const uniqueMonths = sortedData.length > 0 ? sortedData[0].unique_months : 0;

    return { slices, total, uniqueMonths };
  }, [spendingData]);

  // Shared drilldown logic
  const handleDrilldownToGroup = (groupId: string, groupName: string) => {
    if (!drilldownId) { // Only allow drilldown when not already drilled down
      setDrilldownId(groupId);
      setDrilldownName(groupName);
    }
  };

  // Handle double-click on table rows for drilldown
  const handleRowDoubleClick = (item: ExpenseBreakdownItem) => {
    // Convert filter arrays to database format for account filtering
    const getDbFilterArray = (filterArray: string[]) => {
      if (filterArray.includes('all') || filterArray.length === 0) {
        return [];
      }
      return filterArray.map(id => parseInt(id, 10));
    };

    const accountIds = getDbFilterArray(filters.accountIds);

    if (drilldownId) {
      // In drilldown mode, we're showing categories within a group
      // Find the category ID for this specific category
      const category = categories?.find(c => c.name === item.label);
      if (category) {
        openTransactionDrilldown({
          startDate: filters.startDate,
          endDate: filters.endDate,
          categoryId: category.id,
          accountIds,
          sortBy: 'amount',
          sortDirection: 'asc'
        });
      }
    } else {
      // In group mode, find all categories in this group
      const group = categoryGroups?.find(g => g.name === item.label);
      if (group) {
        const groupCategoryIds = categories?.filter(c => c.group_id === group.id).map(c => c.id) || [];
        if (groupCategoryIds.length > 0) {
          openTransactionDrilldown({
            startDate: filters.startDate,
            endDate: filters.endDate,
            categoryIds: groupCategoryIds, // Pass all category IDs for the group
            accountIds,
            sortBy: 'amount',
            sortDirection: 'asc'
          });
        }
      }
    }
  };

  const handleSliceClick = (slice: { name: string; groupId: string }) => {
    if (!drilldownId && slice.groupId) {
      handleDrilldownToGroup(String(slice.groupId), slice.name);
    }
  };

  const SliceTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length || !chartData) return null;
    const slice = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow-sm">
        <p className="font-medium text-gray-900 dark:text-gray-100">{slice.name}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">{formatCurrency(slice.value, currency)}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {((slice.value / (chartData.total || 1)) * 100).toFixed(1)}%
        </p>
      </div>
    );
  };

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">
            {drilldownId ? (
              <>
                <button
                  onClick={() => {
                    setDrilldownId(null);
                    setDrilldownName(null);
                  }}
                  className="mr-2 text-primary hover:underline"
                >
                  &larr; {t('Back')}
                </button>
                <span>{drilldownName} {t('by Category')}</span>
              </>
            ) : (
              t('Spending by Category Group')
            )}
          </CardTitle>
          <p className="text-sm text-gray-500">
            {formatDateRangeLabel(filters.startDate, filters.endDate, userLocale, dateFormat, t('All Time'))}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-96 flex items-center justify-center">
            <p>{t('Loading report data...')}</p>
          </div>
        ) : !chartData ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p>{t('No expense data available for the selected filters')}</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium">{t('Total Expenses')}</h4>
                  <p className="text-2xl font-semibold">
                    {formatCurrency(chartData.total, currency)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">{t('Average Monthly')}</h4>
                  <p className="text-2xl font-semibold">
                    {formatCurrency(
                      chartData.total / (chartData.uniqueMonths || 1),
                      currency,
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="90%"
                    stroke="hsl(var(--card))"
                    strokeWidth={1}
                    onClick={(_, index) => handleSliceClick(chartData.slices[index])}
                    className={!drilldownId ? "cursor-pointer" : undefined}
                  >
                    {chartData.slices.map((slice, index) => (
                      <Cell key={`cell-${index}`} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<SliceTooltip />} />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    formatter={(value, _entry, index) => (
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {value} ({((chartData.slices[index].value / (chartData.total || 1)) * 100).toFixed(1)}%)
                      </span>
                    )}
                    onClick={(_, index) => handleSliceClick(chartData.slices[index])}
                    wrapperStyle={!drilldownId ? { cursor: "pointer" } : undefined}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-medium mb-2">{t('Detailed Breakdown')}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2">
                        {drilldownId ? t('Category') : t('Group')}
                      </th>
                      <th className="text-right py-2">{t('Amount')}</th>
                      <th className="text-right py-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spendingData.map((item) => (
                      <tr
                        key={`${item.group_id}-${item.label}`}
                        className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                        onDoubleClick={() => handleRowDoubleClick(item)}
                        title={t('Double-click to view transactions')}
                      >
                        <td className="py-2">
                          <div className="flex items-center">
                            <span
                              className="w-2 h-2 rounded-full mr-2"
                              style={{
                                backgroundColor: item.color,
                              }}
                            ></span>
                            <span 
                              className={!drilldownId ? "cursor-pointer hover:underline text-primary" : ""}
                              onClick={() => !drilldownId && handleDrilldownToGroup(String(item.group_id), item.label)}
                              title={!drilldownId ? t('Click to drill down into categories') : undefined}
                            >
                              {item.label}
                            </span>
                          </div>
                        </td>
                        <td className="text-right py-2">
                          {formatCurrency((item.value * -1), currency)}
                        </td>
                        <td className="text-right py-2">
                          {chartData?.total && chartData.total > 0
                            ? (((item.value * -1) / chartData.total) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SpendingBreakdownReport;

import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinance } from "@/contexts/finance-context";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency } from "@/lib/currency-formatter";
import { Chart } from "@/components/ui/chart-js";
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

    const labels = sortedData.map(d => d.label);
    const amounts = sortedData.map(d => (d.value * -1) || 0); // Ensure no NaN values
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const backgroundColor = sortedData.map(d => d.color);
    const groupIds = sortedData.map(d => d.group_id);
    const uniqueMonths = sortedData.length > 0 ? sortedData[0].unique_months : 0;

    return {
      labels,
      datasets: [
        {
          data: amounts,
          backgroundColor,
          borderWidth: 1,
        },
      ],
      _groupIds: groupIds,
      total,
      uniqueMonths,
    };
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

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event: any, elements: any[]) => {
      //console.log("[!!] Chart clicked", { event, elements });
      if (!drilldownId && elements && elements.length > 0) {
        const index = elements[0].index;
        //console.log("[!!] Clicked element:", elements[0]);
        //console.log("[!!] Clicked element index:", index);
        //console.log("[!!] dirlldownid:", drilldownId);

        // Get the groupId directly from our stored array
        if (chartData?._groupIds && index >= 0) {
          const clickedGroupId = chartData._groupIds[index];
          const groupName = chartData.labels[index];

          /*console.log("[!!] Clicked group:", {
            id: clickedGroupId,
            name: groupName,
          });*/

          if (clickedGroupId) {
            handleDrilldownToGroup(String(clickedGroupId), groupName);
          }
        }
      }
    },
    plugins: {
      legend: {
        position: "right" as const,
        labels: {
          generateLabels: (chart: any) => {
            const data = chart.data;
            return data.labels.map((label: string, i: number) => ({
              text: `${label} (${((data.datasets[0].data[i] / (chartData?.total || 1)) * 100).toFixed(1)}%)`,
              fillStyle: data.datasets[0].backgroundColor[i],
              index: i,
            }));
          },
        },
        onClick: (event: any, legendItem: any) => {
          if (!drilldownId && chartData?._groupIds && legendItem.index >= 0) {
            const clickedGroupId = chartData._groupIds[legendItem.index];
            const groupName = chartData.labels[legendItem.index];
            if (clickedGroupId) {
              handleDrilldownToGroup(String(clickedGroupId), groupName);
            }
          }
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const amount = context.raw;
            const percentage = (
              (amount / (chartData?.total || 1)) *
              100
            ).toFixed(1);
            return `${formatCurrency(amount, currency)} (${percentage}%)`;
          },
        },
      },
    },
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
              <Chart type="doughnut" data={chartData} options={options} />
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

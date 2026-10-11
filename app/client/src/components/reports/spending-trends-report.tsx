import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDateFnsLocale } from "@/lib/date-fns-locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { Switch } from "@/components/ui/switch";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { formatDateRangeLabel, localDateString } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency-formatter";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CategoryGroup, Category, Transaction } from "@shared/schema";
import { computeSpendingTrends, ChartDataEntry } from "./spending-trends-utils";
import { cn } from "@/lib/utils";
import { openTransactionDrilldown, parseMonthString } from "@/utils/drilldown-utils";

interface SpendingTrendsReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
}

const SpendingTrendsReport: React.FC<SpendingTrendsReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const { currency, categories, categoryGroups, locale: userLocale, dateFormat } = useFinance();
  const isMobile = useIsMobile();
  const [reportData, setReportData] = useState<ChartDataEntry[]>([]);
  const [drilldownId, setDrilldownId] = useState<number | null>(null);
  const [drilldownName, setDrilldownName] = useState<string | null>(null);
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});
  const [categoryColors, setCategoryColors] = useState<
    Record<string, string>
  >({});
  const [highlightedSeries, setHighlightedSeries] = useState<string | null>(
    null,
  );
  const [hoveredCell, setHoveredCell] = useState<{
    row: number | null;
    col: number | null;
  }>({ row: null, col: null });
  const [dataViewEnabled, setDataViewEnabled] = useState(true);

  // Convert filter arrays to database format
  const getDbFilterArray = (filterArray: string[]) => {
    if (filterArray.includes('all') || filterArray.length === 0) {
      return null;
    }
    return filterArray.map(id => parseInt(id, 10));
  };

  // Fetch transactions
  const { data: spendingData = [], isLoading } = useServiceQuery(
    "get_expense_trends",
    {
      rawQuery: true,
      queryParams: {
        start_date: localDateString(filters.startDate),
        end_date: localDateString(filters.endDate),
        input_group_ids: drilldownId ? [drilldownId] : getDbFilterArray(filters.groupIds),
        input_account_ids: getDbFilterArray(filters.accountIds),
        input_category_ids: getDbFilterArray(filters.categoryIds),
        input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
      },
      options: {
        transformResponse: (data: any[]) => {
          if (!Array.isArray(data)) return [];
          return data.map((row) => ({
            label: row.label,
            month: row.month,
            value: parseFloat(row.value),
            color: row.color,
            group_id: row.group_id,
          }));
        },
      },
    },
  );


  // Group transactions by month and category/group
  useEffect(() => {
    const { chartData, groupColors } = computeSpendingTrends(spendingData, dateLocale);
    setGroupColors(groupColors);
    setReportData(chartData);
  }, [spendingData, dateLocale]);

  // Get active series for the chart
  const getBarSeries = () => {
    if (reportData.length === 0) return [];

    const seriesTotals: Record<string, number> = {};

    // Calculate total for each series
    reportData.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (key !== "month" && key !== "date") {
          if (!seriesTotals[key]) {
            seriesTotals[key] = 0;
          }
          seriesTotals[key] += item[key];
        }
      });
    });

    // Sort series by total amount descending
    const sortedSeries = Object.keys(seriesTotals).sort((a, b) => {
      return seriesTotals[b] - seriesTotals[a];
    });

    return sortedSeries;
  };

  // Get color for bar/legend based on group name
  const getSeriesColor = (key: string) => {
    const groupData = spendingData.find((d: any) => d.label === key);
    return groupData?.color || "#6B7280";
  };

  // Use the same color logic for bars
  const getBarColor = getSeriesColor;

  // Shared drilldown logic
  const handleDrilldownToGroup = (groupId: number, groupName: string) => {
    if (!drilldownId) { // Only allow drilldown when not already drilled down
      setDrilldownId(groupId);
      setDrilldownName(groupName);
    }
  };

  // Handle drilldown when clicking on bars
  const handleBarClick = (data: any) => {
    if (drilldownId || !data) return;

    // Find the group data using the label (dataKey) from the clicked bar
    const groupData = spendingData.find((d: any) => d.label === data.dataKey);
    //console.log("[?!] Clicked bar data:", { data, groupData });
    if (groupData && groupData.group_id) {
      handleDrilldownToGroup(groupData.group_id, data.dataKey);
    }

    /*const groupId = parseInt(data.dataKey);
    const group = categoryGroups.find((g) => g.id === groupId);

    if (group) {
      setDrilldownId(groupId);
      setDrilldownName(group.name);
    }*/
  };

  // Handle going back to group view
  const handleBackToGroups = () => {
    setDrilldownId(null);
    setDrilldownName(null);
  };

  // Format date range for display
  const dateRangeText = (() => {
    return formatDateRangeLabel(filters.startDate, filters.endDate, userLocale, dateFormat, t('All Time'));
  })();

  // Calculate total amount
  const totalAmount = reportData.reduce((sum, month) => {
    let monthTotal = 0;
    Object.entries(month).forEach(([key, value]) => {
      if (key !== "month" && key !== "date" && typeof value === "number") {
        monthTotal += value;
      }
    });
    return sum + monthTotal;
  }, 0);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      let totalForMonth = 0;
      payload.forEach((p: any) => {
        totalForMonth += p.value || 0;
      });

      const sortedPayload = [...payload].sort((a, b) => a.value - b.value);

      return (
        <ChartTooltip title={label} className="p-3">
          {sortedPayload.map((entry: any, index: number) => {
            if (entry.value === 0) return null;

            // Use the dataKey directly as it contains the group/category name
            const name = entry.dataKey;

            return (
              <div
                key={`item-${index}`}
                className="flex justify-between items-center mb-1"
              >
                <div className="flex items-center">
                  <span
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: entry.fill }}
                  ></span>
                  <span>{name || "Unknown"}</span>
                </div>
                <span className="font-medium ml-4">
                  {formatCurrency(entry.value, currency)}
                </span>
              </div>
            );
          })}
          <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-1">
            <div className="flex justify-between font-medium">
              <span>{t('Total:')}</span>
              <span>{formatCurrency(totalForMonth, currency)}</span>
            </div>
          </div>
        </ChartTooltip>
      );
    }
    return null;
  };

  // Get name for display in legend
  const getNameFromKey = (key: string) => {
    // Key is the group_name directly from the data
    return key;
  };

  // Handle double-click on table cells for drilldown
  const handleCellDoubleClick = (monthString: string, categoryKey: string) => {
    const month = parseMonthString(monthString);
    if (!month) return;

    // Find the category ID from the spending data
    const categoryData = spendingData.find((d: any) => d.label === categoryKey);
    if (!categoryData) return;

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
      const category = categories?.find(c => c.name === categoryKey);
      if (category) {
        openTransactionDrilldown({
          month,
          categoryId: category.id,
          accountIds,
          sortBy: 'amount',
          sortDirection: 'asc'
        });
      }
    } else {
      // In group mode, find all categories in this group
      const group = categoryGroups?.find(g => g.name === categoryKey);
      if (group) {
        const groupCategoryIds = categories?.filter(c => c.group_id === group.id).map(c => c.id) || [];
        if (groupCategoryIds.length > 0) {
          openTransactionDrilldown({
            month,
            categoryIds: groupCategoryIds, // Pass all category IDs for the group
            accountIds,
            sortBy: 'amount',
            sortDirection: 'asc'
          });
        }
      }
    }
  };

  // Handle double-click on Total column for drilldown (all categories for that month)
  const handleTotalColumnDoubleClick = (monthString: string) => {
    const month = parseMonthString(monthString);
    if (!month) return;

    // Convert filter arrays to database format for account filtering
    const getDbFilterArray = (filterArray: string[]) => {
      if (filterArray.includes('all') || filterArray.length === 0) {
        return [];
      }
      return filterArray.map(id => parseInt(id, 10));
    };

    const accountIds = getDbFilterArray(filters.accountIds);

    if (drilldownId) {
      // We're drilled down into a specific group
      // Show all categories within that group for this month
      const groupCategoryIds = categories?.filter(c => c.group_id === drilldownId).map(c => c.id) || [];
      
      if (groupCategoryIds.length > 0) {
        openTransactionDrilldown({
          month,
          categoryIds: groupCategoryIds, // All categories in the drilled-down group
          accountIds,
          sortBy: 'amount',
          sortDirection: 'asc'
        });
      }
    } else {
      // At group level, show all transactions for that month (no category filter)
      openTransactionDrilldown({
        month,
        accountIds: accountIds.length > 0 ? accountIds : undefined,
        sortBy: 'amount',
        sortDirection: 'asc'
        // No categoryId - shows all categories for that month
      });
    }
  };

  const barSeries = getBarSeries();

  // Calculate data bars metrics for each column
  const getDataBarsMetrics = () => {
    const metrics: Record<string, { min: number; max: number; avg: number }> = {};
    
    barSeries.forEach(key => {
      const values = reportData
        .map(month => month[key] as number)
        .filter(value => value != null && value > 0);
      
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        
        metrics[key] = { min, max, avg };
      }
    });
    
    return metrics;
  };

  // Calculate data bar percentage for a cell value (Excel-style: max value = 100%)
  const getDataBarPercentage = (value: number, columnKey: string, metrics: Record<string, { min: number; max: number; avg: number }>) => {
    const columnMetrics = metrics[columnKey];
    if (!columnMetrics || !value || value <= 0) return 0;
    
    const { max } = columnMetrics;
    
    // Excel-style scaling: value as percentage of maximum
    return (value / max) * 100;
  };

  const dataBarsMetrics = getDataBarsMetrics();

  // Calculate averages for each column (including zeros)
  const calculateColumnAverages = () => {
    const averages: Record<string, number> = {};
    const totalMonths = reportData.length;
    
    if (totalMonths === 0) return averages;
    
    barSeries.forEach(key => {
      const total = reportData.reduce((sum, month) => {
        const value = (month[key] as number) || 0; // Include zeros
        return sum + value;
      }, 0);
      
      averages[key] = total / totalMonths;
    });
    
    return averages;
  };

  const columnAverages = calculateColumnAverages();
  const totalAverage = Object.values(columnAverages).reduce((sum, avg) => sum + avg, 0);

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">
            {drilldownId ? (
              <>
                <button
                  onClick={handleBackToGroups}
                  className="mr-2 text-primary hover:underline"
                >
                  &larr; {t('Back')}
                </button>
                <span>{drilldownName} {t('Spending Over Time')}</span>
              </>
            ) : (
              t('Spending Trends by Category Group')
            )}
          </CardTitle>
          <p className="text-sm text-gray-500">{dateRangeText}</p>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-96 flex items-center justify-center">
            <p>{t('Loading report data...')}</p>
          </div>
        ) : reportData.length === 0 ? (
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
                    {formatCurrency(totalAmount, currency)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">{t('Average Monthly')}</h4>
                  {(() => {
                    const months = reportData.length;
                    const avgMonthly = totalAmount / (months || 1);
                    return (
                      <p className="text-2xl font-semibold">
                        {formatCurrency(avgMonthly, currency)}
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={reportData}
                  margin={isMobile ? { top: 5, right: 5, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}
                  barGap={0}
                  barCategoryGap="10%"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis
                    width={isMobile ? 40 : undefined}
                    tickFormatter={(value) =>
                      value >= 1000
                        ? `${(value / 1000).toFixed(0)}k`
                        : value.toString()
                    }
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value, entry) => {
                      const key = (entry as any).dataKey;
                      return getNameFromKey(key);
                    }}
                    wrapperStyle={{ paddingTop: "10px" }}
                    onMouseEnter={(e) => setHighlightedSeries(e.dataKey as string)}
                    onMouseLeave={() => setHighlightedSeries(null)}
                    onClick={(data: any) => {
                      if (!drilldownId) {
                        const groupData = spendingData.find((d: any) => d.label === data.dataKey);
                        if (groupData && groupData.group_id) {
                          handleDrilldownToGroup(groupData.group_id, data.dataKey);
                        }
                      }
                    }}
                    cursor="pointer"
                  />
                  {barSeries.map((key) => {
                    const color = getBarColor(key);
                    return (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="a"
                        fill={color}
                        onMouseEnter={() => setHighlightedSeries(key)}
                        onMouseLeave={() => setHighlightedSeries(null)}
                        onClick={
                          drilldownId
                            ? undefined
                            : () => handleBarClick({ dataKey: key })
                        }
                        style={{
                          cursor: drilldownId ? "default" : "pointer",
                          opacity:
                            highlightedSeries && highlightedSeries !== key
                              ? 0.3
                              : 1,
                          transition: "opacity 0.2s ease",
                          filter:
                            highlightedSeries === key
                              ? "brightness(1.2)"
                              : "none",
                        }}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Breakdown Table */}
            <div className="mt-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">{t('Monthly Breakdown')}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{t('Data Bars')}</span>
                  <Switch
                    checked={dataViewEnabled}
                    onCheckedChange={setDataViewEnabled}
                  />
                </div>
              </div>
              <table
                className="w-full text-sm"
                onMouseLeave={() => setHoveredCell({ row: null, col: null })}
              >
                <thead className="sticky -top-6 bg-white dark:bg-gray-900 z-50 border-b-2 border-gray-200 dark:border-gray-700 shadow-sm">
                    <tr>
                      <th
                        className={cn(
                          "text-left py-2 px-2 transition-colors",
                          hoveredCell?.col === -1 &&
                            "bg-gray-100 dark:bg-gray-800",
                        )}
                      >
                        {t('Month')}
                      </th>
                      {barSeries.map((key, colIndex) => (
                        <th
                          key={key}
                          className={cn(
                            "text-right py-2 px-2 transition-colors",
                            !drilldownId && "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-primary",
                            hoveredCell?.col === colIndex &&
                              "bg-gray-100 dark:bg-gray-800",
                          )}
                          onClick={() => {
                            if (!drilldownId) {
                              const groupData = spendingData.find((d: any) => d.label === key);
                              if (groupData && groupData.group_id) {
                                handleDrilldownToGroup(groupData.group_id, key);
                              }
                            }
                          }}
                          title={!drilldownId ? t('Click to drill down into categories') : undefined}
                        >
                          {getNameFromKey(key)}
                        </th>
                      ))}
                      <th
                        className={cn(
                          "text-right py-2 px-2 font-bold transition-colors",
                          hoveredCell?.col === barSeries.length &&
                            "bg-gray-100 dark:bg-gray-800",
                        )}
                      >
                        {t('Total')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Average Row */}
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-1.5 px-2 text-xs font-small italic text-gray-600 dark:text-gray-400">
                        {t('Average')}
                      </td>
                      {barSeries.map((key, colIndex) => {
                        const avgValue = columnAverages[key] || 0;
                        return (
                          <td
                            key={key}
                            onMouseEnter={() =>
                              setHoveredCell({
                                row: -1, // Special row index for average
                                col: colIndex,
                              })
                            }
                            className={cn(
                              "text-right py-1.5 px-2 text-xs font-small italic text-gray-600 dark:text-gray-400 transition-colors",
                              hoveredCell?.col === colIndex &&
                                "bg-gray-100 dark:bg-gray-700",
                            )}
                          >
                            {avgValue > 0 ? formatCurrency(avgValue, currency) : "-"}
                          </td>
                        );
                      })}
                      <td
                        onMouseEnter={() =>
                          setHoveredCell({
                            row: -1, // Special row index for average
                            col: barSeries.length,
                          })
                        }
                        className={cn(
                          "text-right py-1.5 px-2 text-xs italic text-gray-600 dark:text-gray-400 transition-colors",
                          hoveredCell?.col === barSeries.length &&
                            "bg-gray-100 dark:bg-gray-700",
                        )}
                      >
                        {formatCurrency(totalAverage, currency)}
                      </td>
                    </tr>
                    {reportData.map((month, rowIndex) => {
                      const monthTotal = Object.entries(month)
                        .filter(([key]) => key !== "month" && key !== "date")
                        .reduce(
                          (sum, [, value]) =>
                            sum + ((value as number) || 0),
                          0,
                        );

                      return (
                        <tr
                          key={rowIndex}
                          className="border-b border-gray-200 dark:border-gray-700"
                        >
                          <td
                            onMouseEnter={() =>
                              setHoveredCell({ row: rowIndex, col: -1 })
                            }
                            className={cn(
                              "py-2 px-2 transition-colors",
                              hoveredCell?.row === rowIndex &&
                                "bg-gray-100 dark:bg-gray-700",
                              hoveredCell?.col === -1 &&
                                "bg-gray-200 dark:bg-gray-700",
                              hoveredCell?.row === rowIndex &&
                                hoveredCell?.col === -1 &&
                                "bg-gray-400 dark:bg-gray-600",
                            )}
                            style={(hoveredCell?.row === rowIndex || hoveredCell?.col === -1) ? {
                              textShadow: '0 0 0 currentColor'
                            } : undefined}
                          >
                            {month.month}
                          </td>
                          {barSeries.map((key, colIndex) => {
                            const cellValue = month[key] as number;
                            const dataBarPercentage = dataViewEnabled && cellValue > 0 
                              ? getDataBarPercentage(cellValue, key, dataBarsMetrics)
                              : 0;
                            const categoryColor = getSeriesColor(key);
                            
                            return (
                              <td
                                key={key}
                                onMouseEnter={() =>
                                  setHoveredCell({
                                    row: rowIndex,
                                    col: colIndex,
                                  })
                                }
                                onDoubleClick={() => month[key] && month[key] > 0 && handleCellDoubleClick(month.month, key)}
                                className={cn(
                                  "text-right py-2 px-2 transition-colors relative",
                                  month[key] && month[key] > 0 && "cursor-pointer hover:bg-gray-300 dark:hover:bg-blue-900/20",
                                  hoveredCell?.row === rowIndex &&
                                    "bg-gray-100 dark:bg-gray-200",
                                  hoveredCell?.col === colIndex &&
                                    "bg-gray-100 dark:bg-gray-200",
                                  hoveredCell?.row === rowIndex &&
                                    hoveredCell?.col === colIndex &&
                                    "bg-gray-400 dark:bg-gray-600",
                                )}
                                style={{
                                  ...(dataViewEnabled && dataBarPercentage > 0 ? {
                                    backgroundImage: `linear-gradient(to right, ${categoryColor}50 0%, ${categoryColor}50 ${dataBarPercentage}%, transparent ${dataBarPercentage}%, transparent 100%)`,
                                  } : {}),
                                  ...((hoveredCell?.row === rowIndex || hoveredCell?.col === colIndex) ? {
                                    backgroundImage: `linear-gradient(to right, ${categoryColor}50 0%, ${categoryColor}50 ${dataBarPercentage}%, transparent ${dataBarPercentage}%, transparent 100%)`
                                  } : {})
                                }}
                                title={month[key] && month[key] > 0 ? t('Double-click to view transactions') : undefined}
                              >
                                <span className="relative z-10">
                                  {month[key]
                                    ? formatCurrency(month[key], currency)
                                    : "-"}
                                </span>
                              </td>
                            );
                          })}
                          <td
                            onMouseEnter={() =>
                              setHoveredCell({
                                row: rowIndex,
                                col: barSeries.length,
                              })
                            }
                            onDoubleClick={() => monthTotal > 0 && handleTotalColumnDoubleClick(month.month)}
                            className={cn(
                              "text-right py-2 px-2 font-bold transition-colors",
                              monthTotal > 0 && "cursor-pointer hover:bg-gray-300 dark:hover:bg-blue-900/20",
                              hoveredCell?.row === rowIndex &&
                                "bg-gray-100 dark:bg-gray-700",
                              hoveredCell?.col === barSeries.length &&
                                "bg-gray-100 dark:bg-gray-700",
                              hoveredCell?.row === rowIndex &&
                                hoveredCell?.col === barSeries.length &&
                                "bg-gray-400 dark:bg-gray-600",
                            )}
                            style={(hoveredCell?.row === rowIndex || hoveredCell?.col === barSeries.length) ? {
                              textShadow: '0 0 0 currentColor'
                            } : undefined}
                            title={monthTotal > 0 ? t('Double-click to view all transactions for this month') : undefined}
                          >
                            {formatCurrency(monthTotal, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SpendingTrendsReport;
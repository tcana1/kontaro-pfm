import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { formatCurrency, roundDown } from "@/lib/currency-formatter";
import { formatDateRangeLabel, localDateString } from "@/lib/date-utils";

interface MultiYearIncomeVsExpensesReportProps {
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
  total: number;
  percentage: number;
};

type MultiYearItemData = {
  group_name: string;
  group_emoji: string;
  group_color: string;
  category_name: string;
  category_color: string;
  years: Record<string, YearData>;
};

type ProcessedItemSummary = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  yearData: Record<string, number>;
  totalAmount: number;
  items?: ProcessedItemSummary[];
};

const MultiYearIncomeVsExpensesReport: React.FC<MultiYearIncomeVsExpensesReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const { currency, locale: userLocale, dateFormat } = useFinance();
  const [incomeSummary, setIncomeSummary] = useState<ProcessedItemSummary[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<ProcessedItemSummary[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [totalsByYear, setTotalsByYear] = useState<Record<string, { income: number; expenses: number; net: number }>>({});
  const [overallTotals, setOverallTotals] = useState({
    income: 0,
    expenses: 0,
    net: 0,
  });

  // Format date range for display
  const dateRangeText = (() => {
    return formatDateRangeLabel(filters.startDate, filters.endDate, userLocale, dateFormat, t('All Time'));
  })();

  // Convert filter arrays to database format
  const getDbFilterArray = (filterArray: string[]) => {
    if (filterArray.includes('all') || filterArray.length === 0) {
      return null;
    }
    return filterArray.map(id => parseInt(id, 10));
  };

  // Fetch multi-year income vs expenses data
  const queryParams = {
    start_date: localDateString(filters.startDate),
    end_date: localDateString(filters.endDate),
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
    input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
  };
  const { data, isLoading } = useServiceQuery("get_income_vs_expenses_multi_year", {
    rawQuery: true,
    queryParams: queryParams,
  });

  // Process data when it changes
  useEffect(() => {
    if (!data || !data.income || !data.expenses) {
      return;
    }

    // Extract all available years from both income and expenses
    const yearsSet = new Set<string>();
    [...data.income, ...data.expenses].forEach((item: MultiYearItemData) => {
      if (item.years) {
        Object.keys(item.years).forEach(year => yearsSet.add(year));
      }
    });
    
    const sortedYears = Array.from(yearsSet).sort();
    setAvailableYears(sortedYears);

    // Process income data
    const processItems = (items: MultiYearItemData[]) => {
      const groupedData = items.reduce((acc, item) => {
        const groupName = item.group_name;
        if (!acc[groupName]) {
          acc[groupName] = {
            id: groupName,
            name: groupName,
            emoji: item.group_emoji,
            color: item.group_color,
            yearData: {},
            totalAmount: 0,
            items: []
          };
          // Initialize year data for all years
          sortedYears.forEach(year => {
            acc[groupName].yearData[year] = 0;
          });
        }
        
        // Add category data
        const categoryYearData: Record<string, number> = {};
        let categoryTotal = 0;
        sortedYears.forEach(year => {
          const yearAmount = item.years[year]?.total || 0;
          categoryYearData[year] = yearAmount;
          categoryTotal += yearAmount;
          acc[groupName].yearData[year] += yearAmount;
        });
        acc[groupName].totalAmount += categoryTotal;

        acc[groupName].items!.push({
          id: item.category_name,
          name: item.category_name,
          emoji: '',
          color: item.category_color,
          yearData: categoryYearData,
          totalAmount: categoryTotal,
        });

        return acc;
      }, {} as Record<string, ProcessedItemSummary>);

      return Object.values(groupedData);
    };

    const incomeData = processItems(data.income);
    const expenseData = processItems(data.expenses);

    // Calculate totals by year and overall
    const yearTotals: Record<string, { income: number; expenses: number; net: number }> = {};
    let totalIncome = 0;
    let totalExpenses = 0;

    sortedYears.forEach(year => {
      const incomeForYear = incomeData.reduce((sum, group) => sum + (group.yearData[year] || 0), 0);
      const expensesForYear = expenseData.reduce((sum, group) => sum + (group.yearData[year] || 0), 0);
      
      yearTotals[year] = {
        income: incomeForYear,
        expenses: expensesForYear,
        net: incomeForYear - expensesForYear,
      };
      
      totalIncome += incomeForYear;
      totalExpenses += expensesForYear;
    });

    // Update state
    setIncomeSummary(incomeData);
    setExpenseSummary(expenseData);
    setTotalsByYear(yearTotals);
    setOverallTotals({
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
    });
  }, [data]);

  const renderTableRow = (item: ProcessedItemSummary, isGroup: boolean = true, isCategory: boolean = false) => {
    return (
      <React.Fragment key={`${isGroup ? 'group' : 'category'}-${item.id}`}>
        <tr className={`${isGroup ? 'border-t border-gray-200 dark:border-gray-700' : 'text-sm text-gray-600 dark:text-gray-400'}`}>
          <td className={`py-${isGroup ? '2' : '1'} ${isCategory ? 'pl-8' : 'pl-4'} ${isGroup ? 'font-medium' : ''}`}>
            <div className="flex items-center">
              <span
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: item.color }}
              ></span>
              {item.name}
            </div>
          </td>
          {availableYears.map((year, index) => {
            const yearAmount = item.yearData[year] || 0;
            const yearTotal = isGroup ? 
              (incomeSummary.some(g => g.id === item.id) ? totalsByYear[year]?.income : totalsByYear[year]?.expenses) :
              (item.name.includes('Income') || incomeSummary.some(g => g.items?.some(c => c.id === item.id)) ? totalsByYear[year]?.income : totalsByYear[year]?.expenses);
            const yearPercentage = yearTotal > 0 ? (yearAmount / yearTotal) * 100 : 0;
            
            return (
              <React.Fragment key={year}>
                <td
                  className={`py-${isGroup ? '2' : '1'} text-right ${availableYears.length > 1 ? 'pr-2' : 'pr-8'} ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}
                >
                  {formatCurrency(roundDown(yearAmount), currency, 0)}
                </td>
                {availableYears.length > 1 && (
                  <td className={`py-${isGroup ? '2' : '1'} text-right pr-4 text-gray-500`}>
                    {yearPercentage > 0 ? yearPercentage.toFixed(1) + "%" : "-"}
                  </td>
                )}
              </React.Fragment>
            );
          })}
          {availableYears.length > 1 && (
            <td className={`py-${isGroup ? '2' : '1'} text-right border-l-2 border-gray-300 dark:border-gray-600 font-medium pl-2 pr-2`}>
              {formatCurrency(roundDown(item.totalAmount), currency, 0)}
            </td>
          )}
          <td className={`py-${isGroup ? '2' : '1'} text-right text-gray-500 ${availableYears.length === 1 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}>
            {overallTotals.income > 0
              ? ((item.totalAmount / overallTotals.income) * 100).toFixed(1) + "%"
              : "-"}
          </td>
        </tr>
        {isGroup && item.items?.map((category) => renderTableRow(category, false, true))}
      </React.Fragment>
    );
  };

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">{t('Multi-Year Income vs. Expenses')}</CardTitle>
        <p className="text-sm text-gray-500">{dateRangeText}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-96 flex items-center justify-center">
            <p>{t('Loading multi-year report data...')}</p>
          </div>
        ) : availableYears.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p>{t('No data available for the selected filters')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Multi-year Summary Cards */}
            

            {/* Main Multi-Year P&L Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-2 font-medium">{t('Category/Group')}</th>
                    {availableYears.map((year, index) => (
                      <th
                        key={year}
                        className={`${availableYears.length > 1 ? 'text-center' : 'text-right pr-8'} py-3 px-2 font-medium ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}
                        colSpan={availableYears.length > 1 ? 2 : 1}
                      >
                        {year}
                      </th>
                    ))}
                    {availableYears.length > 1 && (
                      <th className="text-right py-3 px-2 font-medium border-l-2 border-gray-300 dark:border-gray-600">
                        {t('Total')}
                      </th>
                    )}
                    <th className={`text-right py-3 px-2 font-medium ${availableYears.length === 1 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}>
                      {t('% of Total')}
                    </th>
                  </tr>
                  {availableYears.length > 1 && (
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                      <th></th>
                      {availableYears.map((year, index) => (
                        <React.Fragment key={year}>
                          <th className={`text-right py-2 px-0 ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}>
                            {t('Amount')}
                          </th>
                          <th className="text-right pr-4 py-2 px-0">{t('% of Year')}</th>
                        </React.Fragment>
                      ))}
                      <th className="text-right py-2 px-1 border-l-2 border-gray-300 dark:border-gray-600">{t('Amount')}</th>
                      <th className="text-right py-2 px-1">{t('% of Total')}</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {/* Income Section */}
                  <tr className="bg-gray-50 dark:bg-gray-800/30">
                    <td className="py-2 pl-2 font-medium" colSpan={availableYears.length * (availableYears.length > 1 ? 2 : 1) + (availableYears.length > 1 ? 3 : 2)}>
                      {t('Income')}
                    </td>
                  </tr>

                  {incomeSummary.map((group) => renderTableRow(group))}

                  <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                    <td className="py-2 pl-2">{t('Total Income')}</td>
                    {availableYears.map((year, index) => (
                      <React.Fragment key={year}>
                        <td
                          className={`py-2 text-right ${availableYears.length > 1 ? 'pr-2' : 'pr-8'} ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}
                        >
                          {formatCurrency(roundDown(totalsByYear[year]?.income || 0), currency, 0)}
                        </td>
                        {availableYears.length > 1 && (
                          <td className="py-2 text-right pr-4 text-gray-500">
                            100%
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                    {availableYears.length > 1 && (
                      <td className="py-2 text-right border-l-2 border-gray-300 dark:border-gray-600 font-medium pl-2 pr-2">
                        {formatCurrency(roundDown(overallTotals.income), currency, 0)}
                      </td>
                    )}
                    <td className={`py-2 text-right ${availableYears.length === 1 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}>100%</td>
                  </tr>

                  {/* Expenses Section */}
                  <tr className="bg-gray-50 dark:bg-gray-800/30">
                    <td className="py-2 pl-2 font-medium" colSpan={availableYears.length * (availableYears.length > 1 ? 2 : 1) + (availableYears.length > 1 ? 3 : 2)}>
                      {t('Expenses')}
                    </td>
                  </tr>

                  {expenseSummary.map((group) => renderTableRow(group))}

                  <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                    <td className="py-2 pl-2">{t('Total Expenses')}</td>
                    {availableYears.map((year, index) => (
                      <React.Fragment key={year}>
                        <td
                          className={`py-2 text-right ${availableYears.length > 1 ? 'pr-2' : 'pr-8'} ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}
                        >
                          {formatCurrency(roundDown(totalsByYear[year]?.expenses || 0), currency, 0)}
                        </td>
                        {availableYears.length > 1 && (
                          <td className="py-2 text-right pr-4 text-gray-500">
                            100%
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                    {availableYears.length > 1 && (
                      <td className="py-2 text-right border-l-2 border-gray-300 dark:border-gray-600 font-medium pl-2 pr-2">
                        {formatCurrency(roundDown(overallTotals.expenses), currency, 0)}
                      </td>
                    )}
                    <td className={`py-2 text-right ${availableYears.length === 1 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}>100%</td>
                  </tr>

                  {/* Net Result */}
                  <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-medium">
                    <td className="py-5 pl-2">{t('Net Result')}</td>
                    {availableYears.map((year, index) => {
                      const netAmount = totalsByYear[year]?.net || 0;
                      const incomeAmount = totalsByYear[year]?.income || 0;
                      const netPercentage = incomeAmount > 0 ? (netAmount / incomeAmount) * 100 : 0;
                      
                      return (
                        <React.Fragment key={year}>
                          <td
                            className={`py-5 text-right ${availableYears.length > 1 ? 'pr-2' : 'pr-8'} ${index > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''} ${netAmount >= 0 ? "text-success" : "text-danger"}`}
                          >
                            {formatCurrency(roundDown(netAmount), currency, 0)}
                          </td>
                          {availableYears.length > 1 && (
                            <td className={`py-5 text-right pr-4 ${netAmount >= 0 ? "text-success" : "text-danger"}`}>
                              {incomeAmount > 0 ? netPercentage.toFixed(1) + "%" : "-"}
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {availableYears.length > 1 && (
                      <td
                        className={`py-5 text-right border-l-2 border-gray-300 dark:border-gray-600 font-bold pl-2 pr-2 ${overallTotals.net >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {formatCurrency(roundDown(overallTotals.net), currency, 0)}
                      </td>
                    )}
                    <td className={`py-5 text-right ${availableYears.length === 1 ? 'border-l-2 border-gray-300 dark:border-gray-600 pl-2' : ''}`}>
                      {overallTotals.income > 0
                        ? ((overallTotals.net / overallTotals.income) * 100).toFixed(1) + "%"
                        : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultiYearIncomeVsExpensesReport;
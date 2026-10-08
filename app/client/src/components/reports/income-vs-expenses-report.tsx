import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { formatDateRangeLabel, localDateString } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency-formatter";
import { CategoryGroup, Category, Transaction } from "@shared/schema";

interface IncomeVsExpensesReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
  };
}

type ItemSummary = {
  id: number | string;
  name: string;
  amount: number;
  color: string;
  percentage: number;
  emoji?: string;
  items?: ItemSummary[];
  categories?: ItemSummary[];
};

type GroupAccumulator = Record<string, {
  id: string;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  percentage: number;
  categories: ItemSummary[];
}>;

const IncomeVsExpensesReport: React.FC<IncomeVsExpensesReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const { currency, locale: userLocale, dateFormat } = useFinance();
  const [incomeSummary, setIncomeSummary] = useState<ItemSummary[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<ItemSummary[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netResult, setNetResult] = useState(0);

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

  // Fetch income vs expenses data
  const queryParams = {
    start_date: localDateString(filters.startDate),
    end_date: localDateString(filters.endDate),
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
  };
  const { data, isLoading } = useServiceQuery("get_income_vs_expenses", {
    rawQuery: true,
    queryParams: queryParams,
  });

  // Process data when it changes
  useEffect(() => {
    // Guard clause to avoid processing undefined data
    if (!data || !data.income || !data.expenses) {
      return;
    }

    // Group income data by group name
    const incomeByGroup = data.income.reduce((acc: GroupAccumulator, item: any) => {
      const groupName = item.group_name;
      if (!acc[groupName]) {
        acc[groupName] = {
          id: groupName,
          name: groupName,
          emoji: item.group_emoji,
          color: item.group_color,
          amount: 0,
          percentage: 0,
          categories: []
        };
      }
      acc[groupName].categories.push({
        id: item.category_name,
        name: item.category_name,
        amount: item.total_amount,
        color: item.category_color,
        percentage: 0
      });
      acc[groupName].amount += item.total_amount;
      return acc;
    }, {} as GroupAccumulator);

    const incomeData: ItemSummary[] = Object.values(incomeByGroup);

    // Group expenses data by group name
    const expensesByGroup = data.expenses.reduce((acc: GroupAccumulator, item: any) => {
      const groupName = item.group_name;
      if (!acc[groupName]) {
        acc[groupName] = {
          id: groupName,
          name: groupName,
          emoji: item.group_emoji,
          color: item.group_color,
          amount: 0,
          percentage: 0,
          categories: []
        };
      }
      acc[groupName].categories.push({
        id: item.category_name,
        name: item.category_name,
        amount: item.total_amount,
        color: item.category_color,
        percentage: 0
      });
      acc[groupName].amount += item.total_amount;
      return acc;
    }, {} as GroupAccumulator);

    const expenseData: ItemSummary[] = Object.values(expensesByGroup);

    // Calculate totals
    const incomeTotal = incomeData.reduce(
      (sum, group) => sum + group.amount,
      0,
    );
    const expenseTotal = expenseData.reduce(
      (sum, group) => sum + group.amount,
      0,
    );
    const net = incomeTotal - expenseTotal;

    // Calculate percentages - avoid division by zero
    if (incomeTotal > 0) {
      incomeData.forEach((group) => {
        group.percentage = (group.amount / incomeTotal) * 100;
        group.categories?.forEach((category) => {
          category.percentage = (category.amount / incomeTotal) * 100;
        });
      });
    }

    if (expenseTotal > 0) {
      expenseData.forEach((group) => {
        group.percentage = (group.amount / expenseTotal) * 100;
        group.categories?.forEach((category) => {
          category.percentage = (category.amount / expenseTotal) * 100;
        });
      });
    }

    // Update all state at once to avoid multiple re-renders
    setIncomeSummary(incomeData);
    setExpenseSummary(expenseData);
    setTotalIncome(incomeTotal);
    setTotalExpenses(expenseTotal);
    setNetResult(net);
  }, [data]); // Re-process when data changes

  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">{t('Income vs. Expenses')}</CardTitle>
        <p className="text-sm text-gray-500">{dateRangeText}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-96 flex items-center justify-center">
            <p>{t('Loading report data...')}</p>
          </div>
        ) : totalIncome === 0 && totalExpenses === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p>{t('No data available for the selected filters')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-success">
                  {t('Total Income')}
                </h3>
                <p className="text-2xl font-semibold">
                  {formatCurrency(totalIncome, currency)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-danger">
                  {t('Total Expenses')}
                </h3>
                <p className="text-2xl font-semibold">
                  {formatCurrency(totalExpenses, currency)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium">{t('Net Result')}</h3>
                <p
                  className={`text-2xl font-semibold ${netResult >= 0 ? "text-success" : "text-danger"}`}
                >
                  {formatCurrency(netResult, currency)}
                </p>
              </div>
            </div>

            {/* Main P&L Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th
                      className="text-left py-2 font-medium text-lg"
                      colSpan={3}
                    >
                      {t('Income Statement')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Income Section */}
                  <tr className="bg-gray-50 dark:bg-gray-800/30">
                    <td className="py-2 pl-2 font-medium" colSpan={3}>
                      {t('Income')}
                    </td>
                  </tr>

                  {incomeSummary.map((group) => {
                    const groupKey = `group-income-${group.id}`;
                    return (
                      <React.Fragment key={groupKey}>
                        <tr className="border-t border-gray-200 dark:border-gray-700">
                          <td className="py-2 pl-4 font-medium">
                            <div className="flex items-center">
                              <span
                                className="w-2 h-2 rounded-full mr-2"
                                style={{ backgroundColor: group.color }}
                              ></span>
                              {group.name}
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            {formatCurrency(group.amount, currency)}
                          </td>
                          <td className="py-2 text-right text-gray-500">
                            {group.percentage.toFixed(1)}%
                          </td>
                        </tr>
                        {group.categories?.map((category) => (
                          <tr
                            key={`cat-income-${category.name}`}
                            className="text-sm text-gray-600 dark:text-gray-400"
                          >
                            <td className="py-1 pl-8">
                              <div className="flex items-center">
                                <span
                                  className="w-2 h-2 rounded-full mr-2"
                                  style={{ backgroundColor: category.color }}
                                ></span>
                                {category.name}
                              </div>
                            </td>
                            <td className="py-1 text-right">
                              {formatCurrency(category.amount, currency)}
                            </td>
                            <td className="py-1 text-right">
                              {category.percentage.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}

                  <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                    <td className="py-2 pl-2">{t('Total Income')}</td>
                    <td className="py-2 text-right">
                      {formatCurrency(totalIncome, currency)}
                    </td>
                    <td className="py-2 text-right">100%</td>
                  </tr>

                  {/* Expenses Section */}
                  <tr className="bg-gray-50 dark:bg-gray-800/30">
                    <td className="py-2 pl-2 font-medium" colSpan={3}>
                      {t('Expenses')}
                    </td>
                  </tr>

                  {expenseSummary.map((group) => {
                    const groupKey = `group-expense-${group.id}`;
                    return (
                      <React.Fragment key={groupKey}>
                        <tr className="border-t border-gray-200 dark:border-gray-700">
                          <td className="py-2 pl-4 font-medium">
                            <div className="flex items-center">
                              <span
                                className="w-2 h-2 rounded-full mr-2"
                                style={{ backgroundColor: group.color }}
                              ></span>
                              {group.name}
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            {formatCurrency(group.amount, currency)}
                          </td>
                          <td className="py-2 text-right text-gray-500">
                            {group.percentage.toFixed(1)}%
                          </td>
                        </tr>
                        {group.categories?.map((category) => (
                          <tr
                            key={`cat-expense-${category.name}`}
                            className="text-sm text-gray-600 dark:text-gray-400"
                          >
                            <td className="py-1 pl-8">
                              <div className="flex items-center">
                                <span
                                  className="w-2 h-2 rounded-full mr-2"
                                  style={{ backgroundColor: category.color }}
                                ></span>
                                {category.name}
                              </div>
                            </td>
                            <td className="py-1 text-right">
                              {formatCurrency(category.amount, currency)}
                            </td>
                            <td className="py-1 text-right">
                              {category.percentage.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}

                  <tr className="border-t border-gray-200 dark:border-gray-700 font-medium">
                    <td className="py-2 pl-2">{t('Total Expenses')}</td>
                    <td className="py-2 text-right">
                      {formatCurrency(totalExpenses, currency)}
                    </td>
                    <td className="py-2 text-right">100%</td>
                  </tr>

                  {/* Net Result */}
                  <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-medium text-lg">
                    <td className="py-3 pl-2">{t('Net Result')}</td>
                    <td
                      className={`py-3 text-right ${netResult >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {formatCurrency(netResult, currency)}
                    </td>
                    <td className="py-3 text-right">
                      {totalIncome > 0
                        ? ((netResult / totalIncome) * 100).toFixed(1) + "%"
                        : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bottom Summary */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">{t('Summary')}</h4>
              <p className="text-sm">
                {t('During this period, your total income was')}{" "}
                <span className="font-medium">
                  {formatCurrency(totalIncome, currency)}
                </span>{" "}
                {t('and your total expenses were')}{" "}
                <span className="font-medium">
                  {formatCurrency(totalExpenses, currency)}
                </span>
                {t(', resulting in a{{outcome}} of', { outcome: netResult >= 0 ? ` ${t('surplus')}` : ` ${t('deficit')}` })}{" "}
                <span
                  className={`font-medium ${netResult >= 0 ? "text-success" : "text-danger"}`}
                >
                  {formatCurrency(netResult, currency)}
                </span>
                .
                {totalIncome > 0 && (
                  <>
                    {" "}
                    {t('Your savings rate was')}{" "}
                    <span className="font-medium">
                      {((netResult / totalIncome) * 100).toFixed(1)}%
                    </span>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IncomeVsExpensesReport;
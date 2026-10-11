import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip } from '@/components/ui/chart-tooltip';
import { useQuery } from '@tanstack/react-query';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

interface MonthlySummaryReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountId: string;
    categoryId: string;
  };
}

const MonthlySummaryReport: React.FC<MonthlySummaryReportProps> = ({ filters }) => {
  const { t } = useTranslation();
  const { currency, locale } = useFinance();
  const [reportData, setReportData] = useState<any[]>([]);
  
  // Fetch transactions
  const { data: transactions = [], isLoading } = useQuery<any[]>({
    queryKey: ['transactions'],
  });
  
  // Process data based on filters
  useEffect(() => {
    if (!transactions.length) return;
    
    // Apply filters
    const filteredTransactions = transactions.filter(transaction => {
      const transactionDate = new Date(transaction.paymentDate);
      let matchesFilters = true;
      
      // Date range filter
      matchesFilters = matchesFilters && 
        transactionDate >= filters.startDate &&
        transactionDate <= filters.endDate;
      
      // Account filter
      if (filters.accountId && filters.accountId !== 'all') {
        matchesFilters = matchesFilters && 
          transaction.accountId.toString() === filters.accountId;
      }
      
      // Category filter
      if (filters.categoryId && filters.categoryId !== 'all') {
        matchesFilters = matchesFilters && 
          transaction.categoryId.toString() === filters.categoryId;
      }
      
      return matchesFilters;
    });
    
    // Group by month
    const summaryByMonth: Record<string, { income: number; expenses: number; net: number }> = {};
    
    filteredTransactions.forEach(transaction => {
      const date = new Date(transaction.paymentDate);
      const month = date.getMonth();
      const year = date.getFullYear();
      const monthYear = `${year}-${month.toString().padStart(2, '0')}`;
      const amount = transaction.amount;
      
      if (!summaryByMonth[monthYear]) {
        summaryByMonth[monthYear] = { income: 0, expenses: 0, net: 0 };
      }
      
      if (amount > 0) {
        summaryByMonth[monthYear].income += amount;
      } else {
        summaryByMonth[monthYear].expenses += Math.abs(amount);
      }
      
      summaryByMonth[monthYear].net += amount;
    });
    
    // Format data for chart
    const chartData = Object.entries(summaryByMonth).map(([monthYear, data]) => {
      const [year, month] = monthYear.split('-');
      const date = new Date(parseInt(year), parseInt(month));
      const monthName = date.toLocaleDateString(locale, { month: 'short' });
      
      return {
        month: `${monthName} ${year}`,
        income: data.income,
        expenses: data.expenses,
        net: data.net
      };
    }).sort((a, b) => {
      const [aMonth, aYear] = a.month.split(' ');
      const [bMonth, bYear] = b.month.split(' ');
      return new Date(`${aMonth} 1, ${aYear}`).getTime() - new Date(`${bMonth} 1, ${bYear}`).getTime();
    });
    
    setReportData(chartData);
  }, [transactions, filters]);
  
  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <ChartTooltip title={label}>
          <p className="text-success">
            {t('Income')}: {formatCurrency(payload[0].value, currency)}
          </p>
          <p className="text-danger">
            {t('Expenses')}: {formatCurrency(payload[1].value, currency)}
          </p>
          <p className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
            {t('Net')}: {formatCurrency(payload[2].value, currency)}
          </p>
        </ChartTooltip>
      );
    }
    return null;
  };
  
  // Calculate totals
  const totalIncome = reportData.reduce((sum, item) => sum + item.income, 0);
  const totalExpenses = reportData.reduce((sum, item) => sum + item.expenses, 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;
  
  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">{t('Monthly Income & Expenses')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 flex items-center justify-center">
            <p>{t('Loading report data...')}</p>
          </div>
        ) : reportData.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p>{t('No data available for the selected filters')}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <h4 className="text-sm font-medium text-success">{t('Total Income')}</h4>
                <p className="text-xl font-semibold">{formatCurrency(totalIncome, currency)}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-danger">{t('Total Expenses')}</h4>
                <p className="text-xl font-semibold">{formatCurrency(totalExpenses, currency)}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium">{t('Savings Rate')}</h4>
                <p className="text-xl font-semibold">{savingsRate.toFixed(1)}%</p>
              </div>
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={reportData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `${value > 999 ? `${(value / 1000).toFixed(0)}k` : value}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="income" name={t('Income')} fill="#10B981" />
                  <Bar dataKey="expenses" name={t('Expenses')} fill="#EF4444" />
                  <Bar dataKey="net" name={t('Net')} fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MonthlySummaryReport;

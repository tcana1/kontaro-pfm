import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { useFinance } from '@/contexts/finance-context';
import { formatCurrency } from '@/lib/currency-formatter';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ExpenseByCategoryReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountId: string;
    categoryId: string;
  };
}

const ExpenseByCategoryReport: React.FC<ExpenseByCategoryReportProps> = ({ filters }) => {
  const { t } = useTranslation();
  const { currency, categories } = useFinance();
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
      
      // Only include expenses (negative amounts)
      matchesFilters = matchesFilters && transaction.amount < 0;
      
      return matchesFilters;
    });
    
    // Group by category and sum amounts
    const expensesByCategory: Record<number, number> = {};
    
    filteredTransactions.forEach(transaction => {
      const categoryId = transaction.categoryId;
      const amount = Math.abs(transaction.amount);
      
      if (expensesByCategory[categoryId]) {
        expensesByCategory[categoryId] += amount;
      } else {
        expensesByCategory[categoryId] = amount;
      }
    });
    
    // Format data for chart
    const chartData = Object.entries(expensesByCategory).map(([categoryId, amount]) => {
      const category = categories.find(c => c.id === parseInt(categoryId));
      return {
        name: category?.name || 'Uncategorized',
        value: amount,
        color: category?.color || '#6B7280'
      };
    }).sort((a, b) => b.value - a.value);
    
    setReportData(chartData);
  }, [transactions, filters, categories]);
  
  // Calculate total amount
  const totalAmount = reportData.reduce((sum, item) => sum + item.value, 0);
  
  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm">{formatCurrency(data.value, currency)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {((data.value / totalAmount) * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">{t('Expenses by Category')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 flex items-center justify-center">
            <p>{t('Loading report data...')}</p>
          </div>
        ) : reportData.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <p>{t('No expense data available for the selected filters')}</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h4 className="text-sm font-medium">{t('Total Expenses')}</h4>
              <p className="text-2xl font-semibold">{formatCurrency(totalAmount, currency)}</p>
            </div>
            
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {reportData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    formatter={(value, entry, index) => (
                      <span className="text-sm">
                        {value} (
                        {((reportData[index].value / totalAmount) * 100).toFixed(0)}%)
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ExpenseByCategoryReport;

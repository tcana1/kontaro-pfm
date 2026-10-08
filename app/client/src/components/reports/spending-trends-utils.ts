import { format, type Locale } from "date-fns";

export type SpendingItem = {
  month: string;
  label: string;
  value: number;
  color: string;
  group_id: number;
};

export type ChartDataEntry = {
  month: string;
  date: Date;
  [key: string]: any;
};

export type ComputeSpendingResult = {
  chartData: ChartDataEntry[];
  groupColors: Record<string, string>;
};

export function computeSpendingTrends(spendingData: SpendingItem[], dateLocale?: Locale): ComputeSpendingResult {
  if (!spendingData.length) return { chartData: [], groupColors: {} };

  const expensesByMonth: Record<string, Record<string, number>> = {};
  const groupColors: Record<string, string> = {};

  spendingData.forEach(({ month, label: groupName, value, color }) => {
    if (!expensesByMonth[month]) expensesByMonth[month] = {};
    groupColors[groupName] = color;
    expensesByMonth[month][groupName] = (value * -1) || 0;
  });

  const chartData: ChartDataEntry[] = Object.entries(expensesByMonth)
    .map(([monthKey, expenses]) => {
      const [year, month] = monthKey.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      const entry: ChartDataEntry = { month: format(date, "MMM yyyy", { locale: dateLocale }), date };
      Object.entries(expenses).forEach(([key, amount]) => { entry[key] = amount; });
      return entry;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return { chartData, groupColors };
}

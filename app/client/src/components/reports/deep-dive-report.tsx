import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDateFnsLocale } from "@/lib/date-fns-locale";
import MerchantScatterReport from "@/components/reports/merchant-scatter-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltipList } from "@/components/ui/chart-tooltip";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { localDateString } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency-formatter";
import { Spinner } from "@/components/ui/spinner";
import { openTransactionDrilldown } from "@/utils/drilldown-utils";
import { format, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  LineChart,
  Legend,
} from "recharts";

interface Filters {
  startDate: Date;
  endDate: Date;
  accountIds: string[];
  categoryIds: string[];
  groupIds: string[];
  excludeTagIds: string[];
}

interface DeepDiveReportProps {
  filters: Filters;
}

function getDbFilterArray(arr: string[]): number[] | null {
  if (arr.includes("all") || arr.length === 0) return null;
  return arr.map((id) => parseInt(id, 10));
}

function buildQueryParams(filters: Filters) {
  return {
    start_date: localDateString(filters.startDate),
    end_date: localDateString(filters.endDate),
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
    input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
  };
}

// ── Shared sub-components ─────────────────────────────────────────────────────

const ChartSkeleton: React.FC<{ title: string }> = ({ title }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent className="flex items-center justify-center h-[280px]">
      <Spinner size="lg" />
    </CardContent>
  </Card>
);

const ChartEmpty: React.FC<{ title: string }> = ({ title }) => {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[280px]">
        <p className="text-sm text-muted-foreground">{t('No data for this period')}</p>
      </CardContent>
    </Card>
  );
};

const StatBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="text-xs">
    <span className="text-muted-foreground">{label}: </span>
    <span className="font-semibold">{value}</span>
  </div>
);

// ── Chart 1: Transaction Size Distribution ────────────────────────────────────

type DistributionRow = {
  bucket_label: string;
  bucket_min: number;
  bucket_max: number | null;
  count: number;
};

const HistogramChart: React.FC<{ filters: Filters }> = ({ filters }) => {
  const { t } = useTranslation();
  const { currency } = useFinance();
  const { data, isLoading } = useServiceQuery("get_transaction_size_distribution", {
    rawQuery: true,
    queryParams: buildQueryParams(filters),
  });

  const rows = Array.isArray(data) ? (data as DistributionRow[]) : [];

  const handleBarDoubleClick = (barData: any) => {
    if (!barData) return;
    const categoryIds = getDbFilterArray(filters.categoryIds) ?? undefined;
    const accountIds = getDbFilterArray(filters.accountIds) ?? undefined;
    openTransactionDrilldown({
      startDate: filters.startDate,
      endDate: filters.endDate,
      categoryIds,
      accountIds,
      sortBy: "amount",
      sortDirection: "asc",
    });
  };

  if (isLoading) return <ChartSkeleton title={t('Transaction Size Distribution')} />;
  if (rows.length === 0) return <ChartEmpty title={t('Transaction Size Distribution')} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Transaction Size Distribution')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('How many transactions fall into each spend bucket')}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={rows}
            margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            onDoubleClick={handleBarDoubleClick}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket_label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              content={<ChartTooltipList />}
              formatter={(value: number) => [value, t('Transactions')]}
              cursor={{ fill: "rgba(59,130,246,0.1)" }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1 text-right">{t('Double-click to view transactions')}</p>
      </CardContent>
    </Card>
  );
};

// ── Chart 2: Rolling 30-Day Spend vs Historical Average ───────────────────────

type DailySpendRow = { date: string; daily_total: number };

function generateDailyRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(format(current, "yyyy-MM-dd"));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const RollingSpendChart: React.FC<{ filters: Filters }> = ({ filters }) => {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const { currency } = useFinance();
  const { data, isLoading } = useServiceQuery("get_daily_spending", {
    rawQuery: true,
    queryParams: buildQueryParams(filters),
  });

  const { chartData, avgLine, tooShort } = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0)
      return { chartData: [], avgLine: 0, tooShort: false };

    const rows = data as DailySpendRow[];
    const allDays = generateDailyRange(filters.startDate, filters.endDate);
    const tooShort = allDays.length < 30;

    const rawMap = new Map(rows.map((r) => [r.date, Number(r.daily_total)]));
    const daily = allDays.map((d) => ({ date: d, daily_total: rawMap.get(d) ?? 0 }));

    const chartData = daily.map((d, i) => {
      const windowStart = Math.max(0, i - 29);
      const rolling = daily.slice(windowStart, i + 1).reduce((s, x) => s + x.daily_total, 0);
      return { date: d.date, rolling };
    });

    const totalSpend = daily.reduce((s, x) => s + x.daily_total, 0);
    const avgLine = allDays.length > 0 ? (totalSpend / allDays.length) * 30 : 0;

    return { chartData, avgLine, tooShort };
  }, [data, filters.startDate, filters.endDate]);

  if (isLoading) return <ChartSkeleton title={t('Rolling 30-Day Spend')} />;
  if (chartData.length === 0) return <ChartEmpty title={t('Rolling 30-Day Spend')} />;

  const tickInterval = Math.max(1, Math.floor(chartData.length / 6));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Rolling 30-Day Spend')}</CardTitle>
        {tooShort ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('Select a 30+ day range for a meaningful rolling window')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('Cumulative spend over trailing 30 days vs period average')}</p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(d) => parseISO(d).toLocaleDateString(dateLocale.code, { month: "short", day: "numeric" })}
              interval={tickInterval}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip
              content={<ChartTooltipList />}
              labelFormatter={(d) => format(parseISO(d as string), "PP", { locale: dateLocale })}
              formatter={(v: number, name: string) => [formatCurrency(v, currency), name]}
            />
            <Area
              type="monotone"
              dataKey="rolling"
              name="30-day rolling"
              fill="#3b82f6"
              fillOpacity={0.25}
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <ReferenceLine
              y={avgLine}
              stroke="#ef4444"
              strokeDasharray="6 3"
              label={{ value: "Avg", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// ── Chart 3: Multi-Year Seasonal Pattern ──────────────────────────────────────

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

type SeasonalRow = { year: number; month: number; total: number };

const SeasonalPatternChart: React.FC<{ filters: Filters }> = ({ filters }) => {
  const { t } = useTranslation();
  const { currency } = useFinance();
  const { data, isLoading } = useServiceQuery("get_seasonal_pattern", {
    rawQuery: true,
    queryParams: buildQueryParams(filters),
  });

  const { chartData, years, highestMonth, consistentMonth } = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0)
      return { chartData: [], years: [] as number[], highestMonth: null as null | { label: string; year: number; value: number }, consistentMonth: null as null | { label: string } };

    const rows = data as SeasonalRow[];
    const yearSet = [...new Set(rows.map((r) => r.year))].sort();

    const pivot = new Map<number, Map<number, number>>();
    for (let m = 1; m <= 12; m++) pivot.set(m, new Map());
    rows.forEach(({ year, month, total }) => pivot.get(month)!.set(year, Number(total)));

    const chartData = MONTH_LABELS.map((label, i) => {
      const m = i + 1;
      const entry: Record<string, any> = { month: label };
      yearSet.forEach((y) => {
        const val = pivot.get(m)?.get(y);
        entry[String(y)] = val ?? null;
      });
      return entry;
    });

    let highestMonth: { label: string; year: number; value: number } | null = null;
    rows.forEach(({ year, month, total }) => {
      const v = Number(total);
      if (!highestMonth || v > highestMonth.value) {
        highestMonth = { label: MONTH_LABELS[month - 1], year, value: v };
      }
    });

    let consistentMonth: { label: string } | null = null;
    if (yearSet.length >= 2) {
      let minStddev = Infinity;
      for (let m = 1; m <= 12; m++) {
        const monthMap = pivot.get(m)!;
        const vals = yearSet.map((y) => monthMap.get(y) ?? 0).filter((v) => v > 0);
        if (vals.length < 2) continue;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const stddev = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
        if (stddev < minStddev) {
          minStddev = stddev;
          consistentMonth = { label: MONTH_LABELS[m - 1] };
        }
      }
    }

    return { chartData, years: yearSet, highestMonth, consistentMonth };
  }, [data]);

  if (isLoading) return <ChartSkeleton title={t('Multi-Year Seasonal Pattern')} />;
  if (chartData.length === 0) return <ChartEmpty title={t('Multi-Year Seasonal Pattern')} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Multi-Year Seasonal Pattern')}</CardTitle>
        <div className="flex flex-wrap gap-4 mt-1">
          {highestMonth && (
            <StatBadge
              label={t('Highest month')}
              value={`${highestMonth.label} ${highestMonth.year} — ${formatCurrency(highestMonth.value, currency)}`}
            />
          )}
          {consistentMonth && (
            <StatBadge label={t('Most consistent')} value={consistentMonth.label} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip content={<ChartTooltipList />} formatter={(v: number) => [formatCurrency(v, currency), ""]} />
            <Legend />
            {years.map((year, i) => (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// ── Chart 4: Ticket Size Analysis (Mean vs Median) ────────────────────────────

type TicketRow = {
  month: string;
  mean_ticket: number;
  median_ticket: number;
  visit_count: number;
};

const TicketSizeChart: React.FC<{ filters: Filters }> = ({ filters }) => {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const { currency } = useFinance();
  const { data, isLoading } = useServiceQuery("get_ticket_size_stats", {
    rawQuery: true,
    queryParams: buildQueryParams(filters),
  });

  const rows = Array.isArray(data) ? (data as TicketRow[]) : [];

  const { avgTicket, meanMedianGap, totalVisits } = useMemo(() => {
    if (rows.length === 0) return { avgTicket: 0, meanMedianGap: 0, totalVisits: 0 };
    const avgTicket = rows.reduce((s, r) => s + Number(r.mean_ticket), 0) / rows.length;
    const meanMedianGap =
      rows.reduce((s, r) => s + (Number(r.mean_ticket) - Number(r.median_ticket)), 0) / rows.length;
    const totalVisits = rows.reduce((s, r) => s + Number(r.visit_count), 0);
    return { avgTicket, meanMedianGap, totalVisits };
  }, [rows]);

  const chartData = rows.map((r) => ({
    ...r,
    mean_ticket: Number(r.mean_ticket),
    median_ticket: Number(r.median_ticket),
    visit_count: Number(r.visit_count),
    label: format(parseISO(r.month + "-01"), "MMM yy", { locale: dateLocale }),
  }));

  const handleDoubleClick = (payload: any) => {
    if (!payload?.activePayload?.[0]?.payload) return;
    const row = payload.activePayload[0].payload as (TicketRow & { label: string });
    const [year, month] = row.month.split("-");
    const monthStr = `${year}-${month.padStart(2, "0")}`;
    const categoryIds = getDbFilterArray(filters.categoryIds) ?? undefined;
    const accountIds = getDbFilterArray(filters.accountIds) ?? undefined;
    openTransactionDrilldown({
      month: monthStr,
      categoryIds,
      accountIds,
      sortBy: "amount",
      sortDirection: "asc",
    });
  };

  if (isLoading) return <ChartSkeleton title={t('Ticket Size Analysis')} />;
  if (rows.length === 0) return <ChartEmpty title={t('Ticket Size Analysis')} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Ticket Size Analysis')}</CardTitle>
        <div className="flex flex-wrap gap-4 mt-1">
          <StatBadge label={t('Avg ticket')} value={formatCurrency(avgTicket, currency)} />
          <StatBadge label={t('Mean/Median gap')} value={formatCurrency(meanMedianGap, currency)} />
          <StatBadge label={t('Total visits')} value={String(totalVisits)} />
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            onDoubleClick={handleDoubleClick}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip content={<ChartTooltipList />} formatter={(v: number, name: string) => [formatCurrency(v, currency), name]} />
            <Legend />
            <Area
              type="monotone"
              dataKey="mean_ticket"
              name="Mean"
              fill="#3b82f6"
              fillOpacity={0.25}
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="median_ticket"
              name="Median"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1 text-right">{t('Double-click to view transactions for that month')}</p>
      </CardContent>
    </Card>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const DeepDiveReport: React.FC<DeepDiveReportProps> = ({ filters }) => {
  const { t } = useTranslation();
  const isCategoryFiltered = !filters.categoryIds.includes("all") && filters.categoryIds.length > 0;
  const isGroupFiltered = !filters.groupIds.includes("all") && filters.groupIds.length > 0;

  if (!isCategoryFiltered && !isGroupFiltered) {
    return (
      <Card className="flex items-center justify-center h-[400px]">
        <div className="text-center text-muted-foreground space-y-1">
          <p className="font-medium">{t('Select a category or group to explore')}</p>
          <p className="text-sm">{t('Use the filters above to narrow down to a specific category or group.')}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <HistogramChart filters={filters} />
      <RollingSpendChart filters={filters} />
      <SeasonalPatternChart filters={filters} />
      <TicketSizeChart filters={filters} />
      <div className="col-span-1 md:col-span-2">
        <MerchantScatterReport filters={filters} />
      </div>
    </div>
  );
};

export default DeepDiveReport;

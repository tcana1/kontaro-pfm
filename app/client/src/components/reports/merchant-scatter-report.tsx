import React, { useEffect, useRef, useState } from "react";
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { localDateString } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency-formatter";
import { openTransactionDrilldown } from "@/utils/drilldown-utils";
import { getDbFilterArray } from "@/lib/report-filters";
import { ChartLoadingState, ChartEmptyState } from "./chart-states";

interface MerchantScatterReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
}

type MerchantRow = {
  payee: string;
  visit_count: number;
  total_spent: number;
  avg_per_visit: number;
};

type ClusterKey =
  | "daily_habit"
  | "occasional_splurge"
  | "premium_regular"
  | "regular"
  | "occasional";

type ScatterPoint = MerchantRow & { cluster: ClusterKey };

const CLUSTERS: Record<ClusterKey, { label: string; color: string }> = {
  daily_habit:        { label: "Daily habit",        color: "#22c55e" },
  premium_regular:    { label: "Premium regular",    color: "#3b82f6" },
  occasional_splurge: { label: "Occasional splurge", color: "#ef4444" },
  regular:            { label: "Regular",            color: "#f59e0b" },
  occasional:         { label: "Occasional",         color: "#a855f7" },
};

const TOP_N_OPTIONS = [15, 25, 50];

// Linear interpolation percentile (same as Excel PERCENTILE.INC)
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

type Band = "low" | "mid" | "high";

function getBand(value: number, p33: number, p66: number): Band {
  if (value >= p66) return "high";
  if (value >= p33) return "mid";
  return "low";
}

// 3×3 grid collapsed to 5 named clusters
function assignCluster(
  point: MerchantRow,
  freqP33: number, freqP66: number,
  avgP33:  number, avgP66:  number,
): ClusterKey {
  const freq = getBand(point.visit_count,   freqP33, freqP66);
  const avg  = getBand(point.avg_per_visit, avgP33,  avgP66);

  if (freq === "high" && avg === "low")  return "daily_habit";
  if (freq === "high" && avg === "high") return "premium_regular";
  if (avg  === "high")                   return "occasional_splurge"; // low|mid freq + high avg
  if (freq === "low")                    return "occasional";          // low freq + low|mid avg
  return "regular";                                                    // all remaining mid/mid
}

const CustomTooltip = ({
  active,
  payload,
  currency,
  t,
}: {
  active?: boolean;
  payload?: any[];
  currency: string;
  t: (key: string) => string;
}) => {
  if (!active || !payload?.length) return null;
  const d: ScatterPoint = payload[0]?.payload;
  if (!d) return null;
  return (
    <ChartTooltip title={d.payee} className="p-3">
      <p className="text-muted-foreground">{t('Visits:')} <span className="text-foreground font-medium">{d.visit_count}</span></p>
      <p className="text-muted-foreground">{t('Avg/visit:')} <span className="text-foreground font-medium">{formatCurrency(d.avg_per_visit, currency as any)}</span></p>
      <p className="text-muted-foreground">{t('Total:')} <span className="text-foreground font-medium">{formatCurrency(d.total_spent, currency as any)}</span></p>
    </ChartTooltip>
  );
};

const MerchantScatterReport: React.FC<MerchantScatterReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const { currency, categories } = useFinance();
  const [allPoints, setAllPoints] = useState<ScatterPoint[]>([]);
  const [topN, setTopN] = useState(25);

  const noFilterSelected =
    (filters.categoryIds.includes("all") || filters.categoryIds.length === 0) &&
    (filters.groupIds.includes("all") || filters.groupIds.length === 0);

  const queryParams = {
    start_date: localDateString(filters.startDate),
    end_date: localDateString(filters.endDate),
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
    input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
  };

  const { data, isLoading } = useServiceQuery(
    ["get_merchant_scatter"] as (string | number)[],
    { rawQuery: true, queryParams },
  );

  useEffect(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      setAllPoints([]);
      return;
    }

    const rows = data as MerchantRow[];

    // Compute tercile thresholds from the FULL dataset so that changing
    // the top-N display filter never shifts cluster assignments
    const freqP33 = percentile(rows.map((r) => r.visit_count),   33);
    const freqP66 = percentile(rows.map((r) => r.visit_count),   66);
    const avgP33  = percentile(rows.map((r) => r.avg_per_visit), 33);
    const avgP66  = percentile(rows.map((r) => r.avg_per_visit), 66);

    setAllPoints(
      rows.map((r) => ({
        ...r,
        cluster: assignCluster(r, freqP33, freqP66, avgP33, avgP66),
      })),
    );
  }, [data]);

  const bindDoubleTap = useDoubleTap();
  const lastPoint = useRef<ScatterPoint | null>(null);

  const handleDoubleClick = (point: ScatterPoint | null) => {
    if (!point) return;
    const accountIds = getDbFilterArray(filters.accountIds) ?? [];

    let categoryIds: number[] | undefined;
    if (!filters.categoryIds.includes("all") && filters.categoryIds.length > 0) {
      categoryIds = filters.categoryIds.map((id) => parseInt(id, 10));
    } else if (!filters.groupIds.includes("all") && filters.groupIds.length > 0) {
      const activeGroupIds = filters.groupIds.map((id) => parseInt(id, 10));
      categoryIds = categories
        ?.filter((c) => activeGroupIds.includes(c.group_id))
        .map((c) => c.id);
    }

    openTransactionDrilldown({
      startDate: filters.startDate,
      endDate: filters.endDate,
      search: point.payee,
      categoryIds: categoryIds && categoryIds.length > 0 ? categoryIds : undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      sortBy: "amount",
      sortDirection: "asc",
    });
  };

  // Top-N is a display filter only — thresholds are already baked into allPoints
  const displayedPoints = allPoints.slice(0, topN);

  // Group displayed points by cluster for separate Scatter series (needed for per-color legend)
  const byCluster = (Object.keys(CLUSTERS) as ClusterKey[]).map((key) => ({
    key,
    ...CLUSTERS[key],
    data: displayedPoints.filter((p) => p.cluster === key),
  }));

  // Z-axis: scale avg_per_visit relative to what's displayed
  const maxAvg = Math.max(...displayedPoints.map((p) => p.avg_per_visit), 1);

  if (noFilterSelected) {
    return (
      <Card className="p-4 h-[420px] flex items-center justify-center">
        <p className="text-muted-foreground text-center">
          {t('Select a category or group to see merchant patterns')}
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <ChartLoadingState className="h-[420px]" />
      </Card>
    );
  }

  if (!allPoints.length) {
    return (
      <Card className="p-4">
        <ChartEmptyState className="h-[420px]" message={t('No merchant data for this period')} />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('Merchant Frequency vs Spend')}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('Top')}</span>
            <div className="flex rounded-md border border-border overflow-hidden text-sm">
              {TOP_N_OPTIONS.map((n, i) => (
                <button
                  key={n}
                  className={`px-3 py-1 transition-colors ${
                    i > 0 ? "border-l border-border" : ""
                  } ${
                    topN === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTopN(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="h-[420px] touch-manipulation"
          onClickCapture={() => { lastPoint.current = null; }}
          {...bindDoubleTap(() => handleDoubleClick(lastPoint.current))}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="visit_count"
                name={t('Visit count')}
                tick={{ fontSize: 11 }}
                label={{ value: t('Visit count'), position: "insideBottom", offset: -10, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="total_spent"
                name={t('Total spent')}
                tickFormatter={(v) => formatCurrency(Math.round(v), currency as any, 0)}
                tick={{ fontSize: 11 }}
                label={{ value: t('Total spent'), angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
                width={85}
              />
              <ZAxis
                type="number"
                dataKey="avg_per_visit"
                range={[40, 400]}
                domain={[0, maxAvg]}
              />
              <Tooltip
                content={<CustomTooltip currency={currency} t={t} />}
                cursor={{ strokeDasharray: "3 3" }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
              {byCluster.map(({ key, label, color, data: clusterData }) =>
                clusterData.length > 0 ? (
                  <Scatter
                    key={key}
                    name={label}
                    data={clusterData}
                    fill={color}
                    fillOpacity={0.75}
                    onClick={(point) => { lastPoint.current = point as ScatterPoint; }}
                  />
                ) : null,
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default MerchantScatterReport;

import React, { useEffect, useState } from "react";
import { useDoubleTap } from "@/hooks/use-double-tap";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceQuery } from "@/hooks/useServiceQuery";
import { useFinance } from "@/contexts/finance-context";
import { localDateString } from "@/lib/date-utils";
import { useMoney } from '@/hooks/useMoney';
import { openTransactionDrilldown } from "@/utils/drilldown-utils";
import { getDbFilterArray } from "@/lib/report-filters";
import { ChartLoadingState, ChartEmptyState } from "./chart-states";

interface WeekdayHeatmapReportProps {
  filters: {
    startDate: Date;
    endDate: Date;
    accountIds: string[];
    categoryIds: string[];
    groupIds: string[];
    excludeTagIds: string[];
  };
}

type HeatmapRow = {
  month: string;
  weekday: number;
  total: number;
  average: number;
};

type CellValues = { total: number; average: number };

type ViewMode = "average" | "total";

const WEEKDAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 7 },
];

function getMonthLabel(monthStr: string, locale: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  const mon = date.toLocaleString(locale, { month: "short" });
  const yr = year.slice(2);
  return `${mon} ${yr}`;
}

// Colors come from CSS variables (set on the card content) so the ramp follows the theme:
// light = pale blue -> navy, dark = slate -> vivid blue.
function getCellBg(value: number, max: number): string {
  if (max === 0 || value === 0) return "transparent";
  const pct = Math.round((value / max) * 100);
  return `color-mix(in srgb, var(--heat-high) ${pct}%, var(--heat-low))`;
}

function getCellFg(value: number, max: number): string {
  if (max === 0 || value === 0) return "inherit";
  return value / max > 0.55 ? "var(--heat-fg-strong)" : "var(--heat-fg-soft)";
}

const WeekdayHeatmapReport: React.FC<WeekdayHeatmapReportProps> = ({
  filters,
}) => {
  const { t } = useTranslation();
  const bindDoubleTap = useDoubleTap();
  const { categories, categoryGroups, locale } = useFinance();
  const money = useMoney();
  const [heatmapData, setHeatmapData] = useState<
    Map<string, Map<number, CellValues>>
  >(new Map());
  const [sortedMonths, setSortedMonths] = useState<string[]>([]);
  const [maxTotal, setMaxTotal] = useState(0);
  const [maxAverage, setMaxAverage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("average");

  const handleCellDoubleClick = (month: string) => {
    const accountIds = getDbFilterArray(filters.accountIds) ?? [];

    // Resolve category IDs from the active filters (matching what the SQL sees)
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
      month,
      categoryIds: categoryIds && categoryIds.length > 0 ? categoryIds : undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      sortBy: "amount",
      sortDirection: "asc",
    });
  };

  const queryParams = {
    start_date: localDateString(filters.startDate),
    end_date: localDateString(filters.endDate),
    input_account_ids: getDbFilterArray(filters.accountIds),
    input_category_ids: getDbFilterArray(filters.categoryIds),
    input_group_ids: getDbFilterArray(filters.groupIds),
    input_excluded_tag_ids: getDbFilterArray(filters.excludeTagIds ?? []),
  };

  const { data, isLoading } = useServiceQuery("get_weekday_heatmap", {
    rawQuery: true,
    queryParams,
  });

  useEffect(() => {
    if (!data || !Array.isArray(data)) return;

    const map = new Map<string, Map<number, CellValues>>();
    let maxT = 0;
    let maxA = 0;

    (data as HeatmapRow[]).forEach(({ month, weekday, total, average }) => {
      if (!map.has(month)) map.set(month, new Map());
      map.get(month)!.set(weekday, { total, average });
      if (total > maxT) maxT = total;
      if (average > maxA) maxA = average;
    });

    setSortedMonths(Array.from(map.keys()).sort());
    setHeatmapData(map);
    setMaxTotal(maxT);
    setMaxAverage(maxA);
  }, [data]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <ChartLoadingState className="h-[400px]" />
      </Card>
    );
  }

  if (!data || sortedMonths.length === 0) {
    return (
      <Card className="p-4">
        <ChartEmptyState className="h-[400px]" message={t('No spending data for this period')} />
      </Card>
    );
  }

  const maxValue = viewMode === "average" ? maxAverage : maxTotal;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('Spending by Weekday')}</CardTitle>
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button
              className={`px-3 py-1 transition-colors ${
                viewMode === "average"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("average")}
            >
              {t('Average')}
            </button>
            <button
              className={`px-3 py-1 transition-colors border-l border-border ${
                viewMode === "total"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("total")}
            >
              {t('Total')}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="[--heat-low:#d7e1fe] [--heat-high:#1e40af] [--heat-fg-soft:#1e3a8a] [--heat-fg-strong:#ffffff] dark:[--heat-low:#1e293b] dark:[--heat-high:#2563eb] dark:[--heat-fg-soft:#e2e8f0] dark:[--heat-fg-strong:#ffffff]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-14" />
                {WEEKDAYS.map((wd) => (
                  <th
                    key={wd.value}
                    className="text-sm font-medium text-muted-foreground pb-3 text-center min-w-[90px]"
                  >
                    {wd.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMonths.map((month) => {
                const monthMap = heatmapData.get(month) ?? new Map();
                return (
                  <tr key={month}>
                    <td className="text-sm font-medium text-muted-foreground pr-3 py-1 whitespace-nowrap">
                      {getMonthLabel(month, locale)}
                    </td>
                    {WEEKDAYS.map((wd) => {
                      const cell = monthMap.get(wd.value);
                      const val = cell ? cell[viewMode] : 0;
                      return (
                        <td key={wd.value} className="px-1 py-1">
                          <div
                            className="rounded-lg px-2 py-3 text-center text-sm font-semibold touch-manipulation"
                            style={{
                              backgroundColor: getCellBg(val, maxValue),
                              color: getCellFg(val, maxValue),
                              minHeight: "44px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: val > 0 ? "pointer" : "default",
                            }}
                            {...(val > 0 ? bindDoubleTap(() => handleCellDoubleClick(month)) : {})}
                            title={val > 0 ? t('Double-click to view transactions') : undefined}
                          >
                            {val > 0 ? money(val) : "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <span className="text-xs text-muted-foreground">{t('low')}</span>
          <div
            className="h-3 w-32 rounded"
            style={{
              background: "linear-gradient(to right, var(--heat-low), var(--heat-high))",
            }}
          />
          <span className="text-xs text-muted-foreground">{t('high')}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeekdayHeatmapReport;

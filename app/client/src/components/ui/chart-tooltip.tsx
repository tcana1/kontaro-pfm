import * as React from "react";
import { cn } from "@/lib/utils";

interface ChartTooltipProps {
  title?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function ChartTooltip({ title, className, children }: ChartTooltipProps) {
  return (
    <div
      className={cn(
        "p-2 rounded border shadow-sm text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100",
        className,
      )}
    >
      {title != null && title !== "" && <p className="font-medium mb-1">{title}</p>}
      {children}
    </div>
  );
}

interface ChartTooltipListProps {
  active?: boolean;
  payload?: any[];
  label?: any;
  formatter?: (value: any, name: any, item: any) => [React.ReactNode, React.ReactNode];
  labelFormatter?: (label: any) => React.ReactNode;
}

// Drop-in replacement for Recharts' default tooltip body. Pass formatter/labelFormatter to <Tooltip>, not here:
// Recharts forwards them to the content element.
export function ChartTooltipList({ active, payload, label, formatter, labelFormatter }: ChartTooltipListProps) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip title={labelFormatter ? labelFormatter(label) : label}>
      {payload.map((item, i) => {
        const [value, name] = formatter
          ? formatter(item.value, item.name, item)
          : [item.value, item.name];
        return (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center">
              <span
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: item.color || item.stroke || item.fill }}
              />
              {name ? <span>{name}</span> : null}
            </div>
            <span className="font-medium">{value}</span>
          </div>
        );
      })}
    </ChartTooltip>
  );
}

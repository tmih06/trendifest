import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { RangeKey, SeriesPoint } from "../../../shared/types.ts";
import { formatAxisDate, formatFullDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHART_COLORS } from "./trend-chart.tsx";

interface CompareChartProps {
  points: SeriesPoint[];
  terms: string[];
  range: RangeKey;
  className?: string;
}

interface CompareDatum {
  time: number;
  date: string;
  [key: `v${number}`]: number | null;
}

function CompareTooltip({ active, payload, terms }: TooltipContentProps & { terms: string[] }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload as CompareDatum | undefined;
  if (!datum) return null;

  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {formatFullDate(datum.time)}
      </p>
      <div className="space-y-1.5">
        {terms.map((term, index) => {
          const value = datum[`v${index}`];
          if (value == null) return null;
          return (
            <div key={term} className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="truncate">{term}</span>
              </span>
              <span className="numeric shrink-0 font-medium">{formatNumber(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Comparison view for two to five terms. Google normalizes every term against
 * the same request, so the lines share one 0–100 axis; that is the only honest
 * way to compare them. The accessible data table carries the same series.
 */
export function CompareChart({ points, terms, range, className }: CompareChartProps) {
  const yearTicks = useMemo(() => {
    if (range !== "5y") return undefined;
    const ticks: number[] = [];
    let previousYear = -1;
    for (const point of points) {
      const year = new Date(point.time * 1000).getUTCFullYear();
      if (year !== previousYear) {
        ticks.push(point.time);
        previousYear = year;
      }
    }
    return ticks;
  }, [points, range]);

  const data = useMemo(
    () =>
      points.map((point) => {
        const row: CompareDatum = { time: point.time, date: point.date };
        terms.forEach((_, index) => {
          row[`v${index}`] = point.values[index] ?? null;
        });
        return row;
      }),
    [points, terms],
  );

  return (
    <figure className={cn("m-0", className)}>
      <div aria-hidden="true" className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer={false}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              minTickGap={36}
              ticks={yearTicks}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(value: number) => formatAxisDate(value, range)}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={false}
              width={42}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <RechartsTooltip
              content={(props: TooltipContentProps) => <CompareTooltip {...props} terms={terms} />}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            />
            {terms.map((term, index) => (
              <Line
                key={term}
                dataKey={`v${index}`}
                name={term}
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={1.75}
                dot={false}
                activeDot={{
                  r: 3,
                  strokeWidth: 0,
                  fill: CHART_COLORS[index % CHART_COLORS.length],
                }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {terms.map((term, index) => (
          <span key={term} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="truncate">{term}</span>
          </span>
        ))}
      </div>

      <details className="group mt-3 border-t border-border pt-3 text-xs">
        <summary className="w-fit cursor-pointer rounded-sm py-1 font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
          View data table
        </summary>
        <div className="mt-3 max-h-64 overflow-auto overscroll-contain rounded-md border border-border">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Search interest for {terms.join(", ")}. Values use Google&apos;s 0–100 relative index.
            </caption>
            <thead className="sticky top-0 bg-muted text-xs uppercase tracking-[0.05em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Date
                </th>
                {terms.map((term) => (
                  <th key={term} scope="col" className="px-3 py-2 text-right font-medium">
                    {term}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={datum.time} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {formatFullDate(datum.time)}
                  </td>
                  {terms.map((term, index) => {
                    const value = datum[`v${index}`];
                    return (
                      <td key={term} className="numeric px-3 py-1.5 text-right">
                        {value != null ? formatNumber(value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

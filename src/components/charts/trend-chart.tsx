import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { RangeKey, TermInsight } from "../../../shared/types.ts";
import {
  formatAxisDate,
  formatFullDate,
  formatNumber,
  formatPercent,
  horizonLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

interface ChartDatum {
  time: number;
  date: string;
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  band: number | null;
}

interface TrendChartProps {
  insight: TermInsight;
  range: RangeKey;
  className?: string;
}

function buildChartData(insight: TermInsight): ChartDatum[] {
  const data: ChartDatum[] = insight.history.map((point) => ({
    time: point.time,
    date: point.date,
    actual: point.value,
    forecast: null,
    lower: null,
    band: null,
  }));

  const last = data.at(-1);
  if (last) {
    // Bridge the dashed forecast to the final observation so the projection
    // reads as a continuation rather than a detached line.
    last.forecast = last.actual;
    last.lower = last.actual;
    last.band = 0;
  }

  for (const point of insight.forecast.points) {
    data.push({
      time: point.time,
      date: point.date,
      actual: null,
      forecast: point.value,
      lower: point.lower,
      band: Math.max(0, point.upper - point.lower),
    });
  }

  return data;
}

function TrendTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;
  const forecastRow = payload.find((entry) => entry.dataKey === "forecast");
  const actualRow = payload.find((entry) => entry.dataKey === "actual");

  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {formatFullDate(datum.time)}
      </p>
      <div className="space-y-1.5">
        {actualRow?.value != null ? (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-chart-1" />
              Interest
            </span>
            <span className="numeric font-medium">{formatNumber(Number(actualRow.value))}</span>
          </div>
        ) : null}
        {forecastRow?.value != null ? (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="h-px w-3 border-t border-dashed border-chart-1" />
              Forecast
            </span>
            <span className="numeric font-medium">{formatNumber(Number(forecastRow.value))}</span>
          </div>
        ) : null}
        {datum.lower != null && datum.band != null ? (
          <div className="flex items-center justify-between gap-4 text-muted-foreground">
            <span>80% interval</span>
            <span className="numeric">
              {formatNumber(datum.lower)}–{formatNumber(datum.lower + datum.band)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Single-term history with a damped-trend projection and an 80% band.
 *
 * The chart is decorative for assistive technology: the same series is
 * available in the disclosure table, which is keyboard reachable and complete.
 * Recharts animates from an initial blank state, which makes the line flash on
 * every refresh, so animation is disabled.
 */
export function TrendChart({ insight, range, className }: TrendChartProps) {
  const data = useMemo(() => buildChartData(insight), [insight]);
  const lastTime = data.findLast((datum) => datum.actual != null)?.time;
  const yearTicks = useMemo(() => {
    if (range !== "5y") return undefined;
    const ticks: number[] = [];
    let previousYear = -1;
    for (const datum of data) {
      const year = new Date(datum.time * 1000).getUTCFullYear();
      if (year !== previousYear) {
        ticks.push(datum.time);
        previousYear = year;
      }
    }
    return ticks;
  }, [data, range]);

  if (data.length === 0) {
    return (
      <div className={cn("grid h-72 place-items-center text-sm text-muted-foreground", className)}>
        No observations for this trend.
      </div>
    );
  }

  return (
    <figure className={cn("m-0", className)}>
      <div aria-hidden="true" className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
            {lastTime ? (
              <ReferenceLine
                x={lastTime}
                stroke="var(--border)"
                strokeDasharray="2 4"
                ifOverflow="extendDomain"
              />
            ) : null}
            <RechartsTooltip
              content={(props: TooltipContentProps) => <TrendTooltip {...props} />}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            />
            <Area
              dataKey="lower"
              stackId="confidence"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
              activeDot={false}
              dot={false}
            />
            <Area
              dataKey="band"
              stackId="confidence"
              stroke="none"
              fill="var(--chart-1)"
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
              dot={false}
            />
            <Line
              dataKey="actual"
              name="Interest"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }}
              isAnimationActive={false}
            />
            <Line
              dataKey="forecast"
              name="Forecast"
              stroke="var(--chart-1)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-chart-1" />
          Interest
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-px w-4 border-t border-dashed border-chart-1" />
          Forecast · {formatPercent(insight.forecast.changePct)} over{" "}
          {horizonLabel(range, insight.forecast.horizon)}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-4 rounded-sm bg-chart-1/15" />
          80% interval
        </span>
      </div>

      <details className="group mt-3 border-t border-border pt-3 text-xs">
        <summary className="w-fit cursor-pointer rounded-sm py-1 font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
          View data table
        </summary>
        <div className="mt-3 max-h-64 overflow-auto overscroll-contain rounded-md border border-border">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Search interest and forecast for {insight.term}. Values use Google&apos;s 0–100
              relative index.
            </caption>
            <thead className="sticky top-0 bg-muted text-xs uppercase tracking-[0.05em] text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Interest
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Forecast
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  80% interval
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={`${datum.time}-${datum.actual ?? "f"}`} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {formatFullDate(datum.time)}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right">
                    {datum.actual != null ? formatNumber(datum.actual) : "—"}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right">
                    {datum.forecast != null ? formatNumber(datum.forecast) : "—"}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right text-muted-foreground">
                    {datum.lower != null && datum.band != null
                      ? `${formatNumber(datum.lower)}–${formatNumber(datum.lower + datum.band)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

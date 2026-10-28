import { ArrowDownRight, ArrowUpRight, Minus, Radar, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { RangeKey, WatchlistSummary } from "../../shared/types.ts";
import { geoName } from "../../shared/config.ts";
import { Sparkline } from "@/components/charts/sparkline";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, formatPercent, formatRelative, horizonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface WatchlistTableProps {
  items: WatchlistSummary[];
  range: RangeKey;
  selectedId?: string;
  onSelect?: (item: WatchlistSummary) => void;
  onRemove?: (item: WatchlistSummary) => void;
  onThresholdChange?: (item: WatchlistSummary, threshold: number) => void | Promise<unknown>;
  emptyAction?: ReactNode;
  className?: string;
}

function ChangeCell({ changePct }: { changePct: number }) {
  const Icon = changePct > 2 ? ArrowUpRight : changePct < -2 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        changePct > 2
          ? "text-success"
          : changePct < -2
            ? "text-destructive"
            : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="numeric">{formatPercent(changePct)}</span>
      <span className="sr-only">
        {changePct > 2 ? "increase" : changePct < -2 ? "decrease" : "no meaningful change"}
      </span>
    </span>
  );
}

function ThresholdInput({
  item,
  onCommit,
}: {
  item: WatchlistSummary;
  onCommit: (item: WatchlistSummary, threshold: number) => void;
}) {
  const [value, setValue] = useState(String(item.threshold));

  useEffect(() => {
    setValue(String(item.threshold));
  }, [item.threshold]);

  const commit = () => {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      setValue(String(item.threshold));
      return;
    }
    const next = Math.min(100, Math.max(1, parsed));
    setValue(String(next));
    if (next !== item.threshold) {
      const result: unknown = onCommit(item, next);
      // The store is the source of truth. If the write fails, restore the
      // visible value instead of leaving an unsaved threshold on screen.
      if (result instanceof Promise) {
        result.catch(() => setValue(String(item.threshold)));
      }
    }
  };

  return (
    <span className="relative inline-flex w-20 items-center">
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        step={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setValue(String(item.threshold));
            event.currentTarget.blur();
          }
        }}
        aria-label={`Alert threshold for ${item.term}, percent`}
        className="numeric h-7 w-full pr-5 text-right text-xs"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 text-[0.6875rem] text-muted-foreground"
      >
        %
      </span>
    </span>
  );
}

/**
 * Dense watchlist table. Trend names are buttons because activating one changes
 * the chart, not a row-wide click target; remove stays a labelled icon button.
 */
export function WatchlistTable({
  items,
  range,
  selectedId,
  onSelect,
  onRemove,
  onThresholdChange,
  emptyAction,
  className,
}: WatchlistTableProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No trends monitored"
        description="Monitor a search term to track its interest, forecast it, and get alerts when it moves."
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div className={cn("overflow-x-auto overscroll-contain", className)}>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Monitored search trends with current interest, movement, projection, and alert threshold.
        </caption>
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-[0.05em] text-muted-foreground">
            <th scope="col" className="py-2 pl-1 pr-3 font-medium">
              Trend
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Interest
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Change
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
              Forecast
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">
              Alert at
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium 2xl:table-cell">
              Checked
            </th>
            <th scope="col" className="py-2 pl-3 pr-1 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <tr
                key={item.id}
                className={cn(
                  "border-b border-border/70 transition-colors duration-150 last:border-0",
                  selected && "bg-accent/50",
                )}
              >
                <td className="py-2.5 pl-1 pr-3">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-pressed={selected}
                      className="group flex w-full max-w-40 flex-col rounded-sm text-left focus-visible:outline-offset-4 sm:max-w-56"
                    >
                      <span
                        className={cn(
                          "break-words text-sm text-foreground group-hover:underline group-hover:underline-offset-4",
                          selected ? "font-semibold" : "font-medium",
                        )}
                      >
                        {item.term}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {geoName(item.geo)}
                      </span>
                    </button>
                  ) : (
                    <div className="flex max-w-40 flex-col sm:max-w-56">
                      <span className="break-words text-sm font-medium text-foreground">
                        {item.term}
                      </span>
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {geoName(item.geo)}
                      </span>
                    </div>
                  )}
                </td>

                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <div className="flex items-center gap-3">
                    <Sparkline values={item.insight.sparkline} />
                    <span className="numeric text-sm font-medium">
                      {formatNumber(item.insight.latest)}
                    </span>
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  <ChangeCell changePct={item.insight.changePct} />
                </td>

                <td className="hidden px-3 py-2.5 md:table-cell">
                  <div className="flex flex-col">
                    <span className="numeric text-xs font-medium">
                      {formatPercent(item.insight.forecast.changePct)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {horizonLabel(range, item.insight.forecast.horizon)} ·{" "}
                      {item.insight.forecast.confidence}
                    </span>
                  </div>
                </td>

                <td className="hidden px-3 py-2.5 lg:table-cell">
                  {onThresholdChange ? (
                    <ThresholdInput item={item} onCommit={onThresholdChange} />
                  ) : (
                    <Badge variant="outline">±{item.threshold}%</Badge>
                  )}
                </td>

                <td className="hidden px-3 py-2.5 text-xs text-muted-foreground 2xl:table-cell">
                  <time dateTime={item.lastCheckedAt}>{formatRelative(item.lastCheckedAt)}</time>
                </td>

                <td className="py-2.5 pl-3 pr-1 text-right">
                  {onRemove ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemove(item)}
                      aria-label={`Stop monitoring ${item.term}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

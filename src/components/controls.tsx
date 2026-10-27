import { Pause, Play, RefreshCw } from "lucide-react";
import { useId } from "react";
import { GEO_OPTIONS, RANGE_KEYS, RANGE_OPTIONS } from "../../shared/config.ts";
import type { DataSource, RangeKey } from "../../shared/types.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Country scope for every query on the page; labels the control for AT only. */
export function CountrySelect({ value, onChange, disabled, className }: CountrySelectProps) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label htmlFor={id} className="sr-only">
        Country
      </Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full sm:w-40"
      >
        {GEO_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

interface RangeTabsProps {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
  className?: string;
}

export function RangeTabs({ value, onChange, className }: RangeTabsProps) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className={cn("inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {RANGE_KEYS.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={`${RANGE_OPTIONS[key].shortLabel}: ${RANGE_OPTIONS[key].label}`}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-150",
              active
                ? "border border-input bg-background font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_OPTIONS[key].shortLabel}
          </button>
        );
      })}
    </div>
  );
}

interface RefreshButtonProps {
  onClick: () => void;
  fetching: boolean;
  className?: string;
}

export function RefreshButton({ onClick, fetching, className }: RefreshButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={fetching}
      className={className}
      aria-label={fetching ? "Refreshing data" : "Refresh data"}
    >
      <RefreshCw
        aria-hidden="true"
        className={cn("size-3.5", fetching && "motion-safe:animate-spin")}
      />
      <span className="hidden sm:inline">{fetching ? "Refreshing" : "Refresh"}</span>
    </Button>
  );
}

interface LiveToggleProps {
  live: boolean;
  onChange: (live: boolean) => void;
}

/**
 * Polling is user-paused, not merely silent. The label keeps saying which state
 * the workspace is in, so the motion is never the only feedback.
 */
export function LiveToggle({ live, onChange }: LiveToggleProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={live}
      onClick={() => onChange(!live)}
      aria-label="Live updates"
    >
      {live ? (
        <Pause aria-hidden="true" className="size-3.5" />
      ) : (
        <Play aria-hidden="true" className="size-3.5" />
      )}
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", live ? "bg-success" : "bg-muted-foreground")}
        />
        Live updates
      </span>
    </Button>
  );
}

/** Explicit provenance for every data surface; sample data is never unlabeled. */
export function SourceBadge({ source, stale }: { source: DataSource; stale?: boolean }) {
  if (source === "simulated") {
    return <Badge variant="warning">Sample data</Badge>;
  }
  return (
    <Badge variant="outline">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
      {stale ? "Cached live data" : "Live Google Trends"}
    </Badge>
  );
}

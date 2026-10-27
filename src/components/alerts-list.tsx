import { ArrowDownRight, ArrowUpRight, BellOff, Check, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { Alert } from "../../shared/types.ts";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AlertCopy {
  title: string;
  description: string;
  icon: typeof ArrowUpRight;
  color: string;
}

function alertCopy(alert: Alert): AlertCopy {
  const amount = `${formatNumber(Math.abs(alert.changePct))}%`;
  const movement = alert.range === "3m" ? "day over day" : "week over week";

  if (alert.kind === "forecast-rise") {
    const unit = alert.range === "3m" ? "day" : "week";
    const window = `${alert.horizon ?? 0}-${unit}`;
    return {
      title: `${alert.term} forecast to climb ${amount}`,
      description: `The ${window} projection is ${formatNumber(alert.value)}, above the ${alert.threshold}% alert threshold.`,
      icon: TrendingUp,
      color: "text-chart-1",
    };
  }

  if (alert.kind === "drop") {
    return {
      title: `${alert.term} dropped ${amount}`,
      description: `Search interest moved from ${formatNumber(alert.previous)} to ${formatNumber(alert.value)} ${movement}, past the −${alert.threshold}% threshold.`,
      icon: ArrowDownRight,
      color: "text-destructive",
    };
  }

  return {
    title: `${alert.term} jumped ${amount}`,
    description: `Search interest moved from ${formatNumber(alert.previous)} to ${formatNumber(alert.value)} ${movement}, past the +${alert.threshold}% threshold.`,
    icon: ArrowUpRight,
    color: "text-success",
  };
}

export function AlertItem({
  alert,
  onRead,
  compact = false,
}: {
  alert: Alert;
  onRead?: (id: string) => void;
  compact?: boolean;
}) {
  const copy = alertCopy(alert);
  const Icon = copy.icon;

  return (
    <article
      className={cn("flex gap-3 border-b border-border last:border-0", compact ? "py-3" : "py-4")}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/50"
      >
        <Icon className={cn("size-4", copy.color)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-foreground">{copy.title}</p>
            <p className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">
              {copy.description}
            </p>
          </div>
          {!alert.read ? <Badge variant="accent">Unread</Badge> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <time dateTime={alert.createdAt}>{formatDateTime(alert.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <span className="numeric">{formatPercent(alert.changePct)} move</span>
          {!alert.read && onRead ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onRead(alert.id)}
              className="h-6 px-1.5 text-xs text-muted-foreground"
            >
              <Check aria-hidden="true" className="size-3" />
              Mark read
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AlertList({
  alerts,
  onRead,
  compact = false,
  emptyTitle = "No alerts yet",
  emptyDescription = "Alerts appear when a monitored trend moves past its threshold.",
  emptyAction,
  className,
}: {
  alerts: Alert[];
  onRead?: (id: string) => void;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} onRead={onRead} compact={compact} />
      ))}
    </div>
  );
}

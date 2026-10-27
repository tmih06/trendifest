import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { RangeKey, TermInsight } from "../../shared/types.ts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFullDate, formatNumber, formatPercent, horizonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ForecastPanelProps {
  insight: TermInsight;
  range: RangeKey;
  className?: string;
}

const CONFIDENCE_VARIANT = {
  high: "success",
  medium: "outline",
  low: "warning",
} as const;

/**
 * Plain-language projection with the evidence behind it: horizon, interval,
 * out-of-sample error, and the model. A forecast without those is a guess.
 */
export function ForecastPanel({ insight, range, className }: ForecastPanelProps) {
  const { forecast, term } = insight;
  const endpoint = forecast.points.at(-1);
  const DirectionIcon =
    forecast.direction === "up"
      ? ArrowUpRight
      : forecast.direction === "down"
        ? ArrowDownRight
        : Minus;
  const directionWord =
    forecast.direction === "up" ? "Rising" : forecast.direction === "down" ? "Falling" : "Flat";
  const verb =
    forecast.direction === "up" ? "rise" : forecast.direction === "down" ? "fall" : "hold";
  const horizon = horizonLabel(range, forecast.horizon);
  const changeColor =
    forecast.direction === "up"
      ? "text-success"
      : forecast.direction === "down"
        ? "text-destructive"
        : "text-foreground";

  const sentence =
    forecast.direction === "flat"
      ? `${term} is projected to hold roughly steady over the next ${horizon}.`
      : `${term} is projected to ${verb} ${formatNumber(Math.abs(forecast.changePct))}% over the next ${horizon}.`;

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle>Forecast</CardTitle>
          <CardDescription className="break-words">{term}</CardDescription>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge variant={CONFIDENCE_VARIANT[forecast.confidence]}>
            {forecast.confidence === "high"
              ? "High confidence"
              : forecast.confidence === "medium"
                ? "Medium confidence"
                : "Low confidence"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5 pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Projected change</p>
          <div className="mt-1 flex items-center gap-2">
            <DirectionIcon aria-hidden="true" className={cn("size-6", changeColor)} />
            <p className={cn("numeric text-3xl font-semibold tracking-[-0.02em]", changeColor)}>
              {formatPercent(forecast.changePct)}
            </p>
            <span className="sr-only">{directionWord}</span>
          </div>
          <p className="mt-2 max-w-md text-[0.8125rem] leading-5 text-muted-foreground">
            {sentence}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
          <div>
            <dt className="text-muted-foreground">Latest</dt>
            <dd className="numeric mt-0.5 font-medium text-foreground">
              {formatNumber(insight.latest)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Projected</dt>
            <dd className="numeric mt-0.5 font-medium text-foreground">
              {endpoint ? formatNumber(endpoint.value) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">80% interval</dt>
            <dd className="numeric mt-0.5 font-medium text-foreground">
              {endpoint ? `${formatNumber(endpoint.lower)}–${formatNumber(endpoint.upper)}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Peak</dt>
            <dd className="numeric mt-0.5 font-medium text-foreground">
              {formatNumber(insight.peak)}{" "}
              <span className="font-normal text-muted-foreground">
                {formatFullDate(insight.peakTime)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">4-point momentum</dt>
            <dd className="numeric mt-0.5 font-medium text-foreground">
              {formatPercent(insight.momentum)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Target date</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {endpoint ? formatFullDate(Date.parse(endpoint.date) / 1000) : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-auto rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Damped Holt trend fit on {insight.sampleSize} observations.{" "}
            {forecast.mape != null
              ? `Backtest error ${formatNumber(forecast.mape)}% on a four-step holdout.`
              : "Not enough history for a holdout test."}
          </p>
          {forecast.confidence === "low" ? (
            <p className="mt-1.5 text-xs leading-5 text-warning">
              {insight.sampleSize < 20
                ? "Limited history makes this directional, not a target."
                : "The holdout error is high; treat this as a direction, not a target."}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

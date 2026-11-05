import type { TopicHistoryPoint } from "../../shared/intelligence.ts";
import { NO_BASELINE_LABEL, SPARK_HEIGHT, SPARK_WIDTH, sparklineGeometry } from "@/lib/board";

/**
 * A compact plot of stored potential observations. Fewer than two samples
 * renders the explicit "Insufficient history" state instead of a synthetic flat
 * or zero line, so a missing baseline can never read as measured stability.
 */
export function TrendSparkline({ points }: { points: readonly TopicHistoryPoint[] }) {
  const geometry = sparklineGeometry(points);
  if (!geometry) {
    return <span className="text-[11px] leading-4 text-fg-3">{NO_BASELINE_LABEL}</span>;
  }

  return (
    <svg
      role="img"
      aria-label={geometry.label}
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="shrink-0 overflow-visible"
    >
      <path
        d={geometry.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-fg-3"
      />
      <circle cx={geometry.lastX} cy={geometry.lastY} r={1.9} className="fill-current text-fg" />
    </svg>
  );
}

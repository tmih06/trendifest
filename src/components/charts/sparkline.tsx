import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  className?: string;
}

/**
 * A small, axis-free shape for scanning direction in a table. It is decorative:
 * every value it shows is printed beside it, so screen readers skip the SVG.
 */
export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) return <span className={cn("block h-7 w-24", className)} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 26 - ((value - min) / span) * 22;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const last = points.at(-1)!;

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-7 w-24 text-chart-1", className)}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="2"
        fill="currentColor"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

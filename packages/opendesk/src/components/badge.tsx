import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { isTone, tone as tones, type Tone } from "../lib/tones.ts";

export type BadgeTone = "neutral" | "solid" | "outline" | "ok" | "warn" | "danger" | Tone;

/**
 * A small status chip, derived from OpenDesk's Badge: a semantic meaning
 * (ok, warn, danger) or a palette tone gets its tinted ink, the three styles
 * stay monochrome.
 */
export function Badge({
  children,
  className,
  tone = "neutral",
  dot,
}: {
  children: ReactNode;
  className?: string;
  tone?: BadgeTone;
  dot?: boolean;
}) {
  const semantic: Record<string, Tone> = { ok: "green", warn: "amber", danger: "red" };
  const hue: Tone | null = semantic[tone] ?? (isTone(tone) ? tone : null);
  const toneCls = hue
    ? tones[hue].chip
    : {
        neutral: "bg-hover text-fg-2",
        solid: "bg-inverse text-inverse-fg",
        outline: "border border-line text-fg-2",
      }[tone as "neutral" | "solid" | "outline"];
  const dotCls = hue
    ? tones[hue].solid
    : { neutral: "bg-fg-4", solid: "bg-inverse-fg", outline: "bg-fg-4" }[
        tone as "neutral" | "solid" | "outline"
      ];
  const showsDot = dot || tone === "ok" || tone === "warn" || tone === "danger";
  return (
    <span
      className={cn(
        "inline-flex h-[19px] shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[10.5px] font-medium",
        toneCls,
        className,
      )}
    >
      {showsDot && <span aria-hidden className={cn("size-1.5 rounded-full", dotCls)} />}
      {children}
    </span>
  );
}

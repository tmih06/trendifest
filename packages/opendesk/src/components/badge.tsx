import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type BadgeTone = "neutral" | "ok";

// Derived from OpenDesk's Badge: the ok chip keeps upstream's green tone (soft
// fill, ink text, inset hairline) while neutral stays monochrome. Only the two
// meanings this app renders are kept.
const TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-hover text-fg-2", dot: "bg-fg-4" },
  ok: {
    chip: "bg-tone-green-soft text-tone-green shadow-[inset_0_0_0_1px_var(--tone-green-line)]",
    dot: "bg-tone-green-solid",
  },
};

/** A small status chip: neutral by default, ok for a healthy state. */
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
  const classes = TONES[tone];
  const showsDot = dot || tone === "ok";
  return (
    <span
      className={cn(
        "inline-flex h-[19px] shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-[10.5px] font-medium",
        classes.chip,
        className,
      )}
    >
      {showsDot && <span aria-hidden className={cn("size-1.5 rounded-full", classes.dot)} />}
      {children}
    </span>
  );
}

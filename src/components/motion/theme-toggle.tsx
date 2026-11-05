"use client";

/**
 * @file theme-toggle.tsx
 * Theme toggle button powered by the browser View Transitions API.
 * Constrained strictly to the rectangle clip-path wipe animation.
 *
 * Contract:
 * - Toggles between 'light' and 'dark' themes via `next-themes`.
 * - When View Transitions API is supported and user hasn't requested reduced motion,
 *   smoothly wipes the screen with an expanding rectangle clip-path from the chosen origin.
 * - Respects prefers-reduced-motion by falling back to instant theme swap.
 */

import Moon from "lucide-react/icons/moon";
import Sun from "lucide-react/icons/sun";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import { cn } from "@/lib/utils";

export type RectStart =
  | "top-down"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "bottom-up";

export interface ThemeToggleProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "onClick"
> {
  /** Origin direction for the rectangle reveal. Default: "top-down" (entire browser top). */
  start?: RectStart;
  iconClassName?: string;
}

const VT_STYLE_ID = "beui-theme-toggle-vt";

/**
 * View transitions CSS for the rectangle reveal animation.
 * The incoming theme expands its rectangular clip-path downward across the entire browser.
 */
const VT_CSS = `
html[data-beui-vt="rect"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-beui-vt="rect"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-rect-reveal 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes beui-rect-reveal {
  from { clip-path: var(--beui-vt-from, inset(0 0 100% 0)); }
  to   { clip-path: inset(0 0 0 0); }
}
`;

const RECT_FROM: Record<RectStart, string> = {
  "top-down": "inset(0 0 100% 0)",
  "top-left": "inset(0 100% 100% 0)",
  "top-right": "inset(0 0 100% 100%)",
  "bottom-left": "inset(100% 100% 0 0)",
  "bottom-right": "inset(100% 0 0 100%)",
  center: "inset(50% 50% 50% 50%)",
  "bottom-up": "inset(100% 0 0 0)",
};

/**
 * Hook managing theme toggle state and the View Transitions API rectangle wipe.
 */
export function useThemeToggle({ start = "top-down" }: { start?: RectStart } = {}) {
  const { setTheme, resolvedTheme } = useTheme();
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (document.getElementById(VT_STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = VT_STYLE_ID;
    el.textContent = VT_CSS;
    document.head.appendChild(el);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  // The shared theme provider owns both routes; retain the workspace's mobile
  // browser-bar color without a second competing theme state.
  useEffect(() => {
    if (!mounted) return;
    document.getElementById("theme-color")?.setAttribute("content", isDark ? "#141416" : "#f5f5f5");
  }, [mounted, isDark]);

  const toggle = () => {
    const next = isDark ? "light" : "dark";

    if (reduce || !("startViewTransition" in document)) {
      setTheme(next);
      return;
    }

    const root = document.documentElement;
    root.style.setProperty("--beui-vt-from", RECT_FROM[start]);
    root.dataset.beuiVt = "rect";

    const vt = (
      document as Document & {
        startViewTransition(cb: () => void): { finished: Promise<void> };
      }
    ).startViewTransition(() => setTheme(next));

    void vt.finished.finally(() => {
      delete root.dataset.beuiVt;
    });
  };

  return { isDark, mounted, toggle };
}

/**
 * Theme toggle button with rectangle reveal view transition animation.
 */
export function ThemeToggle({
  start = "top-down",
  className,
  iconClassName = "size-4.5",
  ...rest
}: ThemeToggleProps) {
  const { isDark, mounted, toggle } = useThemeToggle({ start });

  return (
    <button
      type="button"
      aria-label={mounted && isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      onClick={toggle}
      className={cn(
        "flex items-center justify-center rounded-full p-2 transition-colors",
        className,
      )}
      {...rest}
    >
      {mounted ? (
        <ActionSwapIcon
          value={isDark ? "dark" : "light"}
          animation="blur"
          className={iconClassName}
        >
          {isDark ? <Sun className={iconClassName} /> : <Moon className={iconClassName} />}
        </ActionSwapIcon>
      ) : (
        <span className={iconClassName} aria-hidden="true" />
      )}
    </button>
  );
}

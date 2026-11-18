"use client";

/**
 * @file theme-toggle.tsx
 * Immediate, zero-delay light/dark theme toggle backed by `next-themes`.
 *
 * Contract:
 * - Toggles between 'light' and 'dark' immediately without view-transition
 *   curtains or smearing color transitions (`ThemeProvider` sets
 *   `disableTransitionOnChange`).
 * - Syncs the document `#theme-color` meta tag across both routes.
 */

import Moon from "lucide-react/icons/moon";
import Sun from "lucide-react/icons/sun";
import { useTheme } from "next-themes";
import { type ComponentPropsWithoutRef, useEffect, useState } from "react";
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
  /** Retained for caller compatibility; theme switches immediately. */
  start?: RectStart;
  iconClassName?: string;
  /** Accessible label when dark theme is active. */
  lightLabel?: string;
  /** Accessible label when light theme is active. */
  darkLabel?: string;
}

/**
 * Hook managing shared theme state and `#theme-color` meta synchronization.
 */
export function useThemeToggle(_options: { start?: RectStart } = {}) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  // The shared theme provider owns both routes; retain the workspace's mobile
  // browser-bar color without a second competing theme state.
  useEffect(() => {
    if (!mounted) return;
    document.getElementById("theme-color")?.setAttribute("content", isDark ? "#141416" : "#f5f5f5");
  }, [mounted, isDark]);

  const toggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return { isDark, mounted, toggle };
}

/**
 * Immediate light/dark theme toggle button.
 */
export function ThemeToggle({
  start: _start,
  className,
  iconClassName = "size-4",
  lightLabel = "Chuyển sang giao diện sáng",
  darkLabel = "Chuyển sang giao diện tối",
  ...rest
}: ThemeToggleProps) {
  const { isDark, mounted, toggle } = useThemeToggle();

  return (
    <button
      type="button"
      aria-label={mounted && isDark ? lightLabel : darkLabel}
      onClick={toggle}
      className={cn(
        "flex items-center justify-center rounded-lg p-2 transition-[background-color,color,transform] duration-150 ease-out enabled:active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
        className,
      )}
      {...rest}
    >
      {mounted ? (
        isDark ? (
          <Sun className={iconClassName} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Moon className={iconClassName} strokeWidth={1.5} aria-hidden="true" />
        )
      ) : (
        <span className={iconClassName} aria-hidden="true" />
      )}
    </button>
  );
}

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Spinner } from "./spinner.tsx";

// Derived from OpenDesk's web/src/components/ui/button.tsx. Only the shapes this
// app renders are kept: primary, secondary (default) and ghost at sm and xs,
// plus the icon-only (square) and loading forms.
//
// Ghost's ink lives in `styles.css` (`.od-btn-ghost`) rather than in a utility,
// so a caller's `text-fg-3` in the utilities layer still outranks it without a
// class-merging library.
const base =
  "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0";

const VARIANTS = {
  primary: "bg-inverse text-inverse-fg hover:bg-inverse-hover disabled:opacity-40",
  secondary:
    "border border-line bg-surface text-fg shadow-xs hover:border-line-strong hover:bg-hover disabled:opacity-50",
  ghost: "od-btn-ghost hover:bg-hover disabled:opacity-40",
} as const;

// A row and a square form are alternatives, never merged: the square form is
// the row's height as a box, with no padding to cancel out.
const SIZES = {
  xs: {
    row: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
    square: "size-6 gap-1 rounded-md text-xs [&_svg:not([class*='size-'])]:size-3",
  },
  sm: {
    row: "h-7 gap-1.5 rounded-md px-2.5 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
    square: "size-7 gap-1.5 rounded-md text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
  },
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: ReactNode;
  loading?: boolean;
  /** Square, icon-only. Pass aria-label. */
  square?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "sm",
    icon,
    loading,
    square,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, VARIANTS[variant], SIZES[size][square ? "square" : "row"], className)}
      {...rest}
    >
      {icon ? (
        // With an icon the spinner takes its place.
        <>
          {loading ? <Spinner className="size-3.5" /> : icon}
          {children}
        </>
      ) : (
        // Without one it sits over the hidden label, so the button keeps its width.
        <>
          <span className={cn("contents", loading && "[&>*]:opacity-0")}>
            <span className="inline-flex min-w-0 items-center gap-[inherit]">{children}</span>
          </span>
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-3.5" />
            </span>
          )}
        </>
      )}
    </button>
  );
});

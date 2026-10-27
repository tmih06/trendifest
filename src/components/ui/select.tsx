import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Native select with the project's field styling. A native control keeps mobile
 * pickers, keyboard behavior, and screen-reader announcements for free; the
 * chevron is decorative and the consumer supplies a visible `<Label>`.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative inline-flex w-full items-center">
      <select
        data-slot="select"
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-8 text-base text-foreground transition-[border-color,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2 my-auto size-4 text-muted-foreground"
      />
    </span>
  );
}

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-line text input. `text-base` on small screens prevents iOS Safari from
 * zooming the page; desktop keeps the compact 14px interface size.
 */
export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[4px] border border-input bg-transparent px-3 py-1 text-base text-foreground transition-[border-color,background-color] duration-150 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring disabled:bg-muted/50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

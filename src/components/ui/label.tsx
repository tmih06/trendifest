import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Associates a visible field label with its control; never a placeholder. */
export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-[0.8125rem] font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

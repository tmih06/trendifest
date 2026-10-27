import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

/** Page title block. The h1 is programmatically focusable for route changes. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0 space-y-1.5">
        <h1
          id="page-title"
          tabIndex={-1}
          className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground"
        >
          {title}
        </h1>
        <p className="max-w-2xl text-[0.8125rem] leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

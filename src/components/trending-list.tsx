import { ExternalLink, LineChart, TrendingUp } from "lucide-react";
import type { TrendingItem } from "../../shared/types.ts";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TrendingList({
  items,
  onAnalyze,
  className,
}: {
  items: TrendingItem[];
  onAnalyze: (term: string) => void;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No trending searches"
        description="Google Trends did not return today's trending searches for this country."
        className={className}
      />
    );
  }

  return (
    <ol className={cn("divide-y divide-border", className)}>
      {items.map((item, index) => (
        <li
          key={`${item.title}-${index}`}
          className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span
            aria-hidden="true"
            className="numeric mt-0.5 w-4 shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-start gap-1 py-0.5 text-sm font-medium text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-offset-4"
            >
              <span className="break-words">{item.title}</span>
              <ExternalLink
                aria-hidden="true"
                className="mt-0.5 size-3 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">(opens Google Trends in a new tab)</span>
            </a>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.traffic ? `${item.traffic} searches` : "Trending search"}
              {item.publishedAt ? ` · ${formatRelative(item.publishedAt)}` : null}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onAnalyze(item.title)}
            aria-label={`Analyze ${item.title}`}
            className="shrink-0 text-muted-foreground"
          >
            <LineChart aria-hidden="true" className="size-3.5" />
          </Button>
        </li>
      ))}
    </ol>
  );
}

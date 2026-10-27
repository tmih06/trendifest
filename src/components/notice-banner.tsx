import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NoticeBannerProps {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Explains a degraded data mode in place, including how to recover. `status`
 * is polite: the message matters, but it is not an urgent interruption.
 */
export function NoticeBanner({ message, onRetry, retrying }: NoticeBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="text-[0.8125rem] leading-5 text-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button
          variant="outline"
          size="xs"
          onClick={onRetry}
          disabled={retrying}
          className="self-start sm:self-auto"
        >
          {retrying ? "Retrying…" : "Retry live data"}
        </Button>
      ) : null}
    </div>
  );
}

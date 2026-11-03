import { Database, ExternalLink } from "lucide-react";

/**
 * Shown when social collection has no database. Names the two concrete steps
 * instead of the abstract requirement, because "configure the environment" is
 * not a recovery instruction.
 */
export function DbNotice() {
  return (
    <div className="max-w-md space-y-2.5 text-center">
      <p className="text-sm font-medium text-foreground">No collection database</p>
      <p className="text-[0.8125rem] leading-5 text-muted-foreground">
        Social collection stores posts, vectors, and clusters in Postgres with pgvector. Start one
        and point the app at it:
      </p>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-2.5 text-left text-[11px] leading-5 text-foreground">
        <code>{`docker compose up -d
# then add to .env:
TRENDIFEST_DATABASE_URL=postgres://trendifest:trendifest@127.0.0.1:55433/trendifest
TRENDIFEST_SOCIAL=1`}</code>
      </pre>
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Database aria-hidden="true" className="size-3" />
        Restart <code className="rounded bg-muted px-1">bun dev</code> after saving.
        <a
          href="https://github.com/pgvector/pgvector"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          pgvector
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      </p>
    </div>
  );
}

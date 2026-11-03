import { Database } from "lucide-react";

/** Recoverable setup state: keep the exact local database instructions in the graph. */
export function DbNotice() {
  return (
    <div className="w-full max-w-md space-y-3 text-start">
      <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <Database className="size-4" aria-hidden="true" />
        Connect your collection database
      </div>
      <p className="text-[12px] leading-5 text-fg-3">
        Posts, embeddings, and pattern clusters are stored in Postgres with pgvector. Start the
        database and add these settings to your local .env file.
      </p>
      <pre className="mono overflow-x-auto rounded-lg border border-line bg-sunken p-3 text-[10.5px] leading-5 text-fg-2">
        <code>{`docker compose up -d\n# .env\nTRENDIFEST_DATABASE_URL=postgres://trendifest:trendifest@127.0.0.1:55433/trendifest\nTRENDIFEST_SOCIAL=1`}</code>
      </pre>
      <p className="text-[11px] leading-5 text-fg-3">
        Restart <code className="mono rounded bg-hover px-1">bun dev</code> after saving, then open
        Collection status to collect posts.
      </p>
    </div>
  );
}

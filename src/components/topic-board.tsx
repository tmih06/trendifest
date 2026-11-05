import { Badge, Button, cn } from "@trendifest/opendesk";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TrendMapNode } from "../../shared/types.ts";
import { formatRelative, topicSearchText } from "@/lib/format";

const PAGE_SIZE = 80;

interface TopicBoardProps {
  topics: readonly TrendMapNode[];
  selectedId: string | null;
  sourceLabels: ReadonlyMap<string, string>;
  generatedAt: string;
  limited: boolean;
  detailsOpen: boolean;
  onSelect: (id: string) => void;
}

/**
 * A readable alternative to canvas navigation. The caller supplies the same
 * potential-ranked, source/window-filtered snapshot as the graph. Pagination
 * bounds the DOM without inventing trend tiers or dropping full titles.
 */
export function TopicBoard({
  topics,
  selectedId,
  sourceLabels,
  generatedAt,
  limited,
  detailsOpen,
  onSelect,
}: TopicBoardProps) {
  const [query, setQuery] = useState("");
  const [requestedPage, setRequestedPage] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const indexed = useMemo(
    () =>
      topics.map((node, index) => ({ node, rank: index + 1, text: topicSearchText(node.label) })),
    [topics],
  );
  const matches = useMemo(() => {
    const term = topicSearchText(query).trim();
    return term ? indexed.filter((item) => item.text.includes(term)) : indexed;
  }, [indexed, query]);
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
  const page = Math.min(requestedPage, lastPage);
  const start = page * PAGE_SIZE;
  const visible = matches.slice(start, start + PAGE_SIZE);

  // A filtered or newly paged board starts with its first result; the sticky
  // controls stay reachable even after browsing a long page of rows.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [page, query]);

  return (
    <div
      ref={scroll}
      className="topic-board h-full min-h-0 overflow-y-auto overscroll-contain"
      data-details-open={detailsOpen}
    >
      <div className="mx-auto space-y-4 p-4 sm:p-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-4 bg-surface py-3">
          <label className="block w-full max-w-sm text-xs font-medium text-fg-2">
            Search board topics
            <input
              type="search"
              value={query}
              placeholder="e.g. FPT, Olympia, Hà Nội"
              className="mt-2 block min-h-10 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-fg placeholder:text-fg-3 sm:text-sm"
              onChange={(event) => {
                setQuery(event.target.value);
                setRequestedPage(0);
              }}
            />
          </label>
          <nav aria-label="Topic board pages" className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={page === 0}
              onClick={() => setRequestedPage(page - 1)}
            >
              Previous
            </Button>
            <span role="status" className="mono text-xs tabular-nums text-fg-2">
              {matches.length
                ? `${start + 1}–${start + visible.length} of ${matches.length}`
                : "0 matches"}
            </span>
            <Button
              variant="secondary"
              disabled={page === lastPage}
              onClick={() => setRequestedPage(page + 1)}
            >
              Next
            </Button>
          </nav>
        </div>
        <p className="text-xs text-fg-3 xl:hidden">
          Scroll horizontally to see all columns on a narrow screen.
        </p>
        <div
          className="overflow-x-auto overscroll-x-contain rounded-lg border border-line"
          role="region"
          aria-label="Ranked topics table"
          tabIndex={0}
        >
          <table className="w-full min-w-[70rem] border-collapse text-start text-sm leading-normal">
            <caption className="sr-only">
              Topics ranked by potential, highest first. Computed {formatRelative(generatedAt)}.
              Potential is a heuristic, not measured virality.
              {limited && " A bounded sample of up to 1,500 topics."}
            </caption>
            <thead className="bg-sunken text-xs text-fg-2">
              <tr>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Rank
                </th>
                <th scope="col" className="min-w-64 px-3 py-3 text-start font-medium">
                  Topic
                </th>
                <th scope="col" aria-sort="descending" className="px-3 py-3 text-end font-medium">
                  Potential
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  Community accounts
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  Community posts
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  News publishers
                </th>
                <th scope="col" className="px-3 py-3 text-end font-medium">
                  News reports
                </th>
                <th scope="col" className="min-w-40 px-3 py-3 text-start font-medium">
                  Sources
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Last seen
                </th>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Evidence
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ node, rank }) => (
                <tr
                  key={node.id}
                  className={cn(
                    "border-t border-line align-top hover:bg-hover",
                    selectedId === node.id && "bg-active",
                  )}
                >
                  <td className="mono px-3 py-3 text-end text-xs tabular-nums text-fg-3">{rank}</td>
                  <th scope="row" className="px-3 py-3 text-start font-medium text-fg" lang="vi">
                    <button
                      type="button"
                      className="min-h-6 w-full max-w-[32rem] break-words text-start underline decoration-transparent underline-offset-4 hover:decoration-current"
                      aria-pressed={selectedId === node.id}
                      onClick={() => onSelect(node.id)}
                    >
                      {node.label}
                    </button>
                  </th>
                  <td className="px-3 py-3 text-end">
                    <Badge
                      tone={node.potential >= 60 ? "ok" : "neutral"}
                      className="mono tabular-nums"
                    >
                      {node.potential}/100
                    </Badge>
                  </td>
                  <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">{node.authors}</td>
                  <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                    {node.discussionPosts}
                  </td>
                  <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                    {node.publishers}
                  </td>
                  <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                    {node.newsPosts}
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-2">
                    {node.segments.map((id) => sourceLabels.get(id) ?? id).join(" · ")}
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-3">{formatRelative(node.lastSeenAt)}</td>
                  <td className="px-3 py-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`View evidence: ${node.label}`}
                      onClick={() => onSelect(node.id)}
                    >
                      View evidence
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {matches.length === 0 && (
          <div className="space-y-3 rounded-xl border border-line p-6">
            <p className="text-sm text-fg-2">
              No board topic matches “{query}”. Clear the search to see the ranking.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setRequestedPage(0);
              }}
            >
              Clear search
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

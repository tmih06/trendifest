import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { TopicDetail, TopicEntity, TopicTimelineRecord } from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import { request } from "@/lib/api";
import { PHASE_LABELS } from "@/lib/board";

const PAGE_SIZE = 40;
const timestamp = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});
const actionClass =
  "inline-flex min-h-8 items-center rounded-md border border-line px-2.5 py-1 text-[12px] text-fg hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40";

/** All timeline dates use ICT, not the browser's potentially different timezone. */
function EvidenceTime({ value }: { value: string }) {
  return <time dateTime={value}>{timestamp.format(new Date(value))}</time>;
}

/** Preserve source attribution and distinguish thread bumps from publication. */
function TimelineRecord({ record }: { record: TopicTimelineRecord }) {
  return (
    <li className="rounded-lg border border-line p-3">
      <p className="mb-1 break-words text-[11px] text-fg-3">
        {record.evidenceType === "news"
          ? (record.publisher ?? record.source)
          : (record.authorHandle ?? record.source)}
        {" · "}
        {record.evidenceType === "news" ? "News report" : "Community post"}
      </p>
      <a
        href={record.permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="block break-words text-[12px] leading-5 text-fg underline decoration-fg-3 underline-offset-4"
      >
        {record.title || "Open the original record"}
      </a>
      {record.excerpt && (
        <p className="mt-2 break-words text-[11.5px] leading-5 text-fg-2">{record.excerpt}</p>
      )}
      <dl className="mt-3 space-y-1 text-[11px] leading-5 text-fg-3">
        <div>
          <dt className="inline font-medium">
            {record.timeKind === "activity" ? "Thread activity" : "Published"}:{" "}
          </dt>
          <dd className="inline">
            <EvidenceTime value={record.sourceAt} />
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">First collected: </dt>
          <dd className="inline">
            <EvidenceTime value={record.firstCollectedAt} />
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Last observed: </dt>
          <dd className="inline">
            <EvidenceTime value={record.lastObservedAt} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * The map already contains bounded summaries. Fetch full evidence only when the
 * selected topic's disclosure opens; paging never enlarges the graph payload.
 */
export function TopicIntelligencePanel({
  node,
  hours,
  entities,
}: {
  node: TrendMapNode;
  hours: number;
  entities: readonly TopicEntity[];
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const detail = useQuery({
    queryKey: ["topic-detail", node.id, hours, offset],
    queryFn: () =>
      request<TopicDetail>(
        `/api/topics/${encodeURIComponent(node.id)}?${new URLSearchParams({ hours: String(hours), offset: String(offset), limit: String(PAGE_SIZE) })}`,
      ),
    enabled: timelineOpen,
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });
  const ownEntities = entities.filter((entity) => node.entityIds.includes(entity.id));
  const movement = node.trend.rankChange;
  return (
    <section aria-label="Topic intelligence" className="mt-4 space-y-4 border-t border-line pt-4">
      <div>
        <h3 className="label-caps mb-2">Measured direction</h3>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="rounded-md border border-line px-2 py-1 font-medium text-fg">
            {PHASE_LABELS[node.trend.phase]}
          </span>
          {movement !== null && (
            <span className="mono text-fg-2">
              {movement > 0
                ? `↑ ${movement}`
                : movement < 0
                  ? `↓ ${Math.abs(movement)}`
                  : "Rank unchanged"}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-fg-3">
          {node.trend.comparable
            ? `Compares consecutive ${node.trend.windowHours}-hour collection windows. Rank movement uses actual stored observations.`
            : "A comparable collection baseline is not available yet. Imported older records do not establish a sudden rise."}
        </p>
        {node.trend.comparable && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <dt className="text-fg-3">New independent accounts</dt>
              <dd className="mono mt-1 text-[16px] text-fg">{node.trend.newAccounts}</dd>
            </div>
            <div>
              <dt className="text-fg-3">New independent publishers</dt>
              <dd className="mono mt-1 text-[16px] text-fg">{node.trend.newPublishers}</dd>
            </div>
          </dl>
        )}
      </div>
      <div>
        <h3 className="label-caps mb-2">Attention channels</h3>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-2.5">
            <dt className="text-[11px] text-fg-3">News attention</dt>
            <dd className="mono mt-1 text-[18px] text-fg">
              {node.attention.news}
              <span className="text-[11px] text-fg-3">/100</span>
            </dd>
            <dd className="mt-1 text-[11px] text-fg-3">
              {node.attention.newsPublishers} publishers
            </dd>
          </div>
          <div className="rounded-lg border border-line p-2.5">
            <dt className="text-[11px] text-fg-3">Community momentum</dt>
            <dd className="mono mt-1 text-[18px] text-fg">
              {node.attention.community}
              <span className="text-[11px] text-fg-3">/100</span>
            </dd>
            <dd className="mt-1 text-[11px] text-fg-3">
              {node.attention.communityAccounts} accounts
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] leading-5 text-fg-3">
          Heuristic evidence scores, not audience estimates. Publisher coverage does not establish
          community virality.
        </p>
      </div>
      <div>
        <h3 className="label-caps mb-2">Why this score and direction</h3>
        <ul className="list-disc space-y-1 ps-4 text-[11.5px] leading-5 text-fg-2">
          {node.trend.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      {ownEntities.length > 0 && (
        <div>
          <h3 className="label-caps mb-2">Named entities</h3>
          <ul className="flex flex-wrap gap-1.5">
            {ownEntities.map((entity) => (
              <li
                key={entity.id}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-fg-2"
                title={`${entity.kind} · ${entity.aliases.join(", ")}`}
              >
                {entity.label}
                <span className="ms-1 text-fg-3">· {entity.kind}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-5 text-fg-3">
            Source-derived name matching. Shared entities do not mean two incidents are the same
            topic.
          </p>
        </div>
      )}
      <details
        onToggle={(event) => setTimelineOpen(event.currentTarget.open)}
        className="border-t border-line pt-3"
      >
        <summary className="min-h-8 cursor-pointer text-[12px] font-medium text-fg">
          Open topic timeline
        </summary>
        {timelineOpen && (
          <div className="mt-2 space-y-3">
            <p className="text-[11px] leading-5 text-fg-3">
              Ordered by source publication or thread activity. Collection times are separate
              observations. All dates are ICT (UTC+7).
            </p>
            <p role="status" className="text-[11px] text-fg-3">
              {detail.isFetching
                ? "Loading source records…"
                : detail.data
                  ? `${detail.data.total === 0 ? 0 : detail.data.offset + 1}–${detail.data.offset + detail.data.records.length} of ${detail.data.total} records`
                  : ""}
            </p>
            {detail.isError && (
              <div role="alert" className="space-y-2 text-[12px] leading-5 text-fg-2">
                <p>Unable to load the timeline. {detail.error.message}</p>
                <button type="button" className={actionClass} onClick={() => void detail.refetch()}>
                  Retry timeline
                </button>
              </div>
            )}
            {detail.data && (
              <>
                {detail.data.total === 0 ? (
                  <p className="text-[12px] leading-5 text-fg-3">
                    No original records remain in this time window. Choose a longer window.
                  </p>
                ) : (
                  <ol className="space-y-2" aria-label="Source-grounded topic timeline">
                    {detail.data.records.map((record) => (
                      <TimelineRecord key={record.id} record={record} />
                    ))}
                  </ol>
                )}
                <nav
                  aria-label="Timeline pages"
                  className="flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    className={actionClass}
                    disabled={offset === 0 || detail.isFetching}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Previous records
                  </button>
                  <button
                    type="button"
                    className={actionClass}
                    disabled={
                      detail.isFetching ||
                      detail.data.offset + detail.data.records.length >= detail.data.total
                    }
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next records
                  </button>
                </nav>
              </>
            )}
          </div>
        )}
      </details>
    </section>
  );
}

/**
 * Retained alerts may outlive the visible 1,500-topic sample. Open their real
 * catalog/timeline directly rather than silently selecting a missing graph node.
 */
export function TopicArchivePanel({ topicId }: { topicId: string }) {
  const [offset, setOffset] = useState(0);
  const detail = useQuery({
    queryKey: ["topic-detail", topicId, 720, offset],
    queryFn: () =>
      request<TopicDetail>(
        `/api/topics/${encodeURIComponent(topicId)}?hours=720&offset=${offset}&limit=${PAGE_SIZE}`,
      ),
    staleTime: 60_000,
    retry: 1,
  });
  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-5 text-fg-3">
        This topic is outside the current visible sample. Showing retained evidence from the last 30
        days, independently of graph selection. Dates are ICT (UTC+7).
      </p>
      <p role="status" className="text-[12px] text-fg-3">
        {detail.isFetching
          ? "Loading retained evidence…"
          : detail.data
            ? `${detail.data.total} retained records`
            : ""}
      </p>
      {detail.isError && (
        <div role="alert" className="space-y-2 text-[12px] leading-5 text-fg-2">
          <p>Unable to load retained evidence. {detail.error.message}</p>
          <button type="button" className={actionClass} onClick={() => void detail.refetch()}>
            Retry retained evidence
          </button>
        </div>
      )}
      {detail.data && (
        <>
          <h3 className="break-words text-[16px] font-medium leading-6 text-fg">
            {detail.data.label}
          </h3>
          {detail.data.total === 0 ? (
            <p className="text-[12px] leading-5 text-fg-3">
              No source records remain in the retained evidence window. The notification remains an
              observation from its recorded time, not a claim of current momentum.
            </p>
          ) : (
            <ol aria-label="Retained source evidence" className="space-y-3">
              {detail.data.records.map((record) => (
                <TimelineRecord key={record.id} record={record} />
              ))}
            </ol>
          )}
          <nav
            aria-label="Retained evidence pages"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <button
              type="button"
              className={actionClass}
              disabled={offset === 0 || detail.isFetching}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous records
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={
                detail.isFetching ||
                detail.data.offset + detail.data.records.length >= detail.data.total
              }
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next records
            </button>
          </nav>
          {detail.data.history.length > 0 && (
            <details>
              <summary className="min-h-8 cursor-pointer text-[12px] font-medium text-fg">
                Show observed ranking history
              </summary>
              <p className="my-2 text-[11px] leading-5 text-fg-3">
                Actual sampled snapshots, not reconstructed historical popularity.
              </p>
              <div
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label="Observed topic ranking history"
              >
                <table className="w-full text-start text-[12px]">
                  <thead>
                    <tr>
                      <th scope="col" className="p-2 text-start">
                        Observed at
                      </th>
                      <th scope="col" className="p-2 text-end">
                        Rank
                      </th>
                      <th scope="col" className="p-2 text-end">
                        Potential
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.history.map((point) => (
                      <tr key={point.at}>
                        <td className="p-2">
                          <EvidenceTime value={point.at} />
                        </td>
                        <td className="mono p-2 text-end">{point.rank}</td>
                        <td className="mono p-2 text-end">{point.potential}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

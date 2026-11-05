import { Badge, Button } from "@trendifest/opendesk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  TopicDetail,
  TopicReviewDecision,
  TopicReviewResult,
} from "../../shared/intelligence.ts";
import { useTrendMap } from "@/hooks/use-trends";
import { request } from "@/lib/api";
import {
  MAX_SELECTED_RECORDS,
  decisionSummary,
  mergeTargetOptions,
  toggleSelection,
} from "@/lib/review";

const PAGE_SIZE = 20;

const timestamp = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

interface TopicReviewPanelProps {
  topicId: string;
  hours: number;
  /**
   * Called with the topic the reviewer should look at next: the surviving topic
   * after a merge, or the topic that was reviewed after a split or undo.
   */
  onChanged: (topicId: string) => void;
}

function timeOf(value: string) {
  return timestamp.format(new Date(value));
}

function fetchDetail(topicId: string, hours: number, offset: number) {
  const query = new URLSearchParams({
    hours: String(hours),
    offset: String(offset),
    limit: String(PAGE_SIZE),
  });
  return request<TopicDetail>(`/api/topics/${encodeURIComponent(topicId)}?${query}`);
}

/**
 * Human correction of the automatic grouping: merge two topics that are one
 * event, split one topic that is two, and undo either decision.
 *
 * The server owns the guards; this panel never predicts them. It sends the
 * reviewer's choice, shows the exact message the guard produced when the choice
 * is refused, and reloads the topic from its own response so the visible
 * grouping always matches stored state. No control here is decorative: every
 * selection comes from a real topic or a real record, and every action writes an
 * audited decision that can be undone.
 *
 * Records are chosen from the paginated timeline rather than from the three
 * examples the inspector already shows, because a split is only meaningful
 * against the full membership of the topic.
 */
export function TopicReviewPanel({ topicId, hours, onChanged }: TopicReviewPanelProps) {
  const client = useQueryClient();
  const headingId = useId();
  const modeLegendId = useId();
  const targetHelpId = useId();
  const noteHelpId = useId();
  const noteId = useId();
  const recordsHelpId = useId();
  const targetSelectId = useId();
  const searchId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Scoped per panel instance: two mounted panels must not share one radio group.
  const modeName = `${useId()}-review-mode`;

  const [mode, setMode] = useState<"merge" | "split">("merge");
  const [offset, setOffset] = useState(0);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // The map is the shared, cached snapshot the inspector already reads; a merge
  // target must be a topic that actually exists in this window. The stale window
  // is wide so opening the panel never starts a second fetch of the same data.
  const map = useTrendMap(hours);
  const detail = useQuery({
    // Same prefix as the inspector's timeline query, so one invalidation of
    // ["topic-detail"] refreshes the panel and the timeline together.
    queryKey: ["topic-detail", topicId, hours, "review", offset],
    queryFn: () => fetchDetail(topicId, hours, offset),
    staleTime: 30_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });

  const decisions = detail.data?.review.decisions ?? [];
  const records = detail.data?.records ?? [];
  const total = detail.data?.total ?? 0;
  const atLastPage = detail.data ? detail.data.offset + records.length >= total : true;

  /**
   * A topic that leaves the current window, or a merge that changes the id, must
   * not leave a selection pointing at records that are no longer members.
   */
  useEffect(() => {
    setSelected(new Set());
    setOffset(0);
    setTargetId("");
    setNote("");
    setConfirming(false);
    setError(null);
    setStatus("");
  }, [topicId, hours]);

  const mergeOptions = useMemo(
    () => mergeTargetOptions(map.data?.nodes ?? [], topicId, targetQuery),
    [map.data, targetQuery, topicId],
  );

  const targetLabel = useMemo(() => {
    if (!targetId) return "";
    if (targetId === topicId) return detail.data?.label ?? targetId;
    return map.data?.nodes.find((node) => node.id === targetId)?.label ?? targetId;
  }, [detail.data, map.data, targetId, topicId]);

  const labelForTopic = useMemo(() => {
    const labels = new Map<string, string>();
    for (const node of map.data?.nodes ?? []) labels.set(node.id, node.label);
    if (detail.data) labels.set(detail.data.topicId, detail.data.label);
    return labels;
  }, [detail.data, map.data]);

  /** Refresh every view a decision can change, then show the right topic. */
  const settle = async (message: string, nextTopic: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["trend-map"] }),
      client.invalidateQueries({ queryKey: ["topic-detail"] }),
      client.invalidateQueries({ queryKey: ["watchlists"] }),
    ]);
    setNote("");
    setSelected(new Set());
    setTargetId("");
    setConfirming(false);
    setError(null);
    setStatus(message);
    onChanged(nextTopic);
  };

  const apply = useMutation({
    mutationFn: (input: { mode: "merge" | "split" }) =>
      request<TopicReviewResult>("/api/topic-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: input.mode,
          // First id survives: the topic the reviewer chose as "merge into".
          topicIds: input.mode === "merge" ? [targetId, topicId] : [topicId],
          recordIds: input.mode === "split" ? [...selected] : [],
          note: note.trim(),
        }),
      }),
    onMutate: () => setError(null),
    onSuccess: (result) =>
      settle(
        result.decision.operation === "merge"
          ? `Merged “${detail.data?.label ?? topicId}” into “${labelForTopic.get(result.topicId) ?? result.topicId}”. Unchanged reviewed records remain locked.`
          : `Split ${result.decision.recordIds.length} record${result.decision.recordIds.length === 1 ? "" : "s"} into a new topic.`,
        result.decision.operation === "merge" ? result.topicId : topicId,
      ),
    onError: (failure: Error) => {
      setConfirming(false);
      setError(failure.message);
    },
  });

  const undo = useMutation({
    mutationFn: (decision: TopicReviewDecision) =>
      request<{ ok: true }>(`/api/topic-reviews/${encodeURIComponent(decision.id)}`, {
        method: "DELETE",
      }),
    onMutate: () => setError(null),
    onSuccess: (_result, decision) => {
      // A split's manual id redirects after undo. Wait for the new map before
      // selecting its source, or the parent would clear it against the old map.
      const source = decision.topicIds[0];
      return settle(
        "Review undone. Earlier memberships are restored; automatic grouping can use new evidence.",
        decision.targetId === topicId && source ? source : topicId,
      );
    },
    onError: (failure: Error) => setError(failure.message),
  });

  const review = () => {
    setError(null);
    if (mode === "merge") {
      if (!targetId) {
        setError("Choose the topic these records belong to.");
        return;
      }
      if (targetId === topicId) {
        setError("Choose a different topic. A merge needs two topics.");
        return;
      }
    }
    if (mode === "split" && selected.size === 0) {
      setError("Select the records that belong in the new topic.");
      return;
    }
    if (!note.trim()) {
      setError("Add a short note explaining the correction.");
      return;
    }
    setConfirming(true);
  };

  // The confirmation is the destructive step, so focus moves to the safe action
  // (Cancel) instead of landing on the irreversible one.
  useEffect(() => {
    if (confirming) cancelButton.current?.focus();
  }, [confirming]);

  const locked = detail.data?.review.lockedRecords ?? 0;
  const busy = apply.isPending || undo.isPending;

  const toggleRecord = (id: string) => {
    setSelected((current) => toggleSelection(current, id, MAX_SELECTED_RECORDS));
    setConfirming(false);
  };

  return (
    <section aria-labelledby={headingId} className="space-y-4 border-t border-line pt-4">
      <div>
        <h3 id={headingId} className="label-caps mb-2">
          Correct this topic
        </h3>
        <p className="text-[11px] leading-5 text-fg-3">
          Reviews change the grouping only. Original posts, sources and topic vectors are never
          edited. Every decision keeps your note; undo is available while the covered records are
          unchanged and no newer decision depends on them.
          {locked > 0 &&
            ` ${locked} record${locked === 1 ? " is" : "s are"} held by a review, so automatic grouping will not move ${locked === 1 ? "it" : "them"}.`}
        </p>
      </div>

      <fieldset aria-labelledby={modeLegendId} className="space-y-2">
        <legend id={modeLegendId} className="sr-only">
          Review action
        </legend>
        {(
          [
            {
              value: "merge",
              label: "Merge into another topic",
              hint: "Two topics are one event.",
            },
            { value: "split", label: "Split out records", hint: "This topic is two events." },
          ] as const
        ).map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-2 rounded-md border border-line px-3 py-2 text-[12px] text-fg"
          >
            <input
              type="radio"
              name={modeName}
              value={option.value}
              checked={mode === option.value}
              className="mt-0.5"
              onChange={() => {
                setMode(option.value);
                setConfirming(false);
                setError(null);
              }}
            />
            <span className="min-w-0">
              <span className="font-medium">{option.label}</span>
              <span className="block text-[11px] text-fg-3">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {detail.isError && (
        <p className="text-[12px] leading-5 text-fg-2">
          Unable to load this topic’s records. {detail.error.message}
        </p>
      )}

      {mode === "merge" ? (
        <div className="space-y-2">
          <label htmlFor={searchId} className="block text-[11px] font-medium text-fg-2">
            Search topics to merge into
            <input
              id={searchId}
              type="search"
              value={targetQuery}
              placeholder="Event, product or model"
              className="mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-2 text-base text-fg placeholder:text-fg-3 xl:text-[12px]"
              onChange={(event) => setTargetQuery(event.target.value)}
            />
          </label>
          <label htmlFor={targetSelectId} className="block text-[11px] font-medium text-fg-2">
            Merge into
            <select
              id={targetSelectId}
              value={targetId}
              aria-describedby={targetHelpId}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-2 text-base text-fg xl:text-[12px]"
              onChange={(event) => {
                setTargetId(event.target.value);
                setConfirming(false);
              }}
            >
              <option value="">Choose a topic</option>
              {mergeOptions.shown.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <p id={targetHelpId} className="text-[11px] leading-5 text-fg-3">
            {mergeOptions.matchCount === 0
              ? map.isLoading
                ? "Loading topics…"
                : "No other topic matches that search."
              : mergeOptions.matchCount > mergeOptions.shown.length
                ? `Showing ${mergeOptions.shown.length} of ${mergeOptions.matchCount} matching topics. Type to narrow the list.`
                : "The topic you choose keeps its place; this topic’s records move into it and its links redirect there."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-medium text-fg-2">
              Records in this window
              <span className="ms-1 font-normal text-fg-3">
                {selected.size} selected of {total}
              </span>
            </h4>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                disabled={records.length === 0}
                onClick={() => {
                  const next = new Set(selected);
                  for (const record of records) {
                    if (next.size >= MAX_SELECTED_RECORDS) break;
                    next.add(record.id);
                  }
                  setSelected(next);
                  setConfirming(false);
                }}
              >
                Select this page
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={selected.size === 0}
                onClick={() => {
                  setSelected(new Set());
                  setConfirming(false);
                }}
              >
                Clear selection
              </Button>
            </div>
          </div>
          <fieldset aria-describedby={recordsHelpId} className="min-w-0">
            <legend className="sr-only">Records that belong in the new topic</legend>
            {records.length === 0 && !detail.isLoading ? (
              <p className="text-[12px] leading-5 text-fg-3">
                No records are available in this window, so this topic cannot be split.
              </p>
            ) : (
              <ul className="space-y-1">
                {records.map((record) => (
                  <li key={record.id}>
                    <label className="flex items-start gap-2 rounded-md border border-line px-2.5 py-2 text-[11.5px] leading-5 text-fg">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(record.id)}
                        onChange={() => toggleRecord(record.id)}
                      />
                      <span className="min-w-0">
                        <span className="block break-words">
                          {record.title || record.excerpt || "Untitled record"}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-fg-3">
                          <span>
                            {record.evidenceType === "news"
                              ? (record.publisher ?? record.source)
                              : (record.authorHandle ?? record.source)}
                            {" · "}
                            <time dateTime={record.sourceAt}>{timeOf(record.sourceAt)}</time>
                            {record.timeKind === "activity" ? " (thread activity)" : ""}
                          </span>
                          <a
                            href={record.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-6 underline decoration-fg-3 underline-offset-4"
                          >
                            Open original record
                          </a>
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <p id={recordsHelpId} className="text-[11px] leading-5 text-fg-3">
            Choose the records that belong in a separate topic. The rest stays here, and at least
            one record must stay behind.
          </p>
          <nav aria-label="Record pages" className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={offset === 0 || detail.isFetching}
              onClick={() => setOffset(Math.max(0, (detail.data?.offset ?? offset) - PAGE_SIZE))}
            >
              Previous records
            </Button>
            <span role="status" className="mono text-[10.5px] text-fg-3">
              {detail.isFetching
                ? "Loading records…"
                : total === 0
                  ? "0 records"
                  : `${(detail.data?.offset ?? offset) + 1}–${(detail.data?.offset ?? offset) + records.length} of ${total}`}
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={detail.isFetching || atLastPage}
              onClick={() => setOffset((detail.data?.offset ?? offset) + PAGE_SIZE)}
            >
              Next records
            </Button>
          </nav>
        </div>
      )}

      <label htmlFor={noteId} className="block text-[11px] font-medium text-fg-2">
        Why is this correction right?
        <textarea
          id={noteId}
          value={note}
          rows={2}
          maxLength={500}
          aria-describedby={noteHelpId}
          className="mt-1 block w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-base text-fg placeholder:text-fg-3 xl:text-[12px]"
          placeholder="e.g. Both posts report the same announcement."
          onChange={(event) => {
            setNote(event.target.value);
            setConfirming(false);
          }}
        />
      </label>
      <p id={noteHelpId} className="text-[11px] leading-5 text-fg-3">
        The note is stored with the decision so a later reviewer can see the reason.
      </p>

      {confirming ? (
        <div
          role="group"
          aria-label="Confirm review"
          className="space-y-2 rounded-lg border border-line bg-sunken p-3"
        >
          <p className="text-[12px] leading-5 text-fg">
            {mode === "merge"
              ? `Move all records from “${detail.data?.label ?? topicId}” into “${targetLabel}”. The source topic keeps its links and redirects to the target.`
              : `Move ${selected.size} selected record${selected.size === 1 ? "" : "s"} into a new topic. Both parts stay locked so later grouping cannot rejoin them.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={apply.isPending}
              onClick={() => apply.mutate({ mode })}
            >
              {mode === "merge" ? "Confirm merge" : "Confirm split"}
            </Button>
            <Button
              ref={cancelButton}
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" disabled={busy} onClick={review}>
          {mode === "merge" ? "Review merge" : "Review split"}
        </Button>
      )}

      <div role="alert" className="text-[11.5px] leading-5 text-danger-fg">
        {error}
      </div>
      <div role="status" className="text-[11.5px] leading-5 text-fg-2">
        {status}
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <h4 className="label-caps">Review history</h4>
        {detail.isLoading ? (
          <p className="text-[11px] leading-5 text-fg-3">Loading review history…</p>
        ) : decisions.length === 0 ? (
          <p className="text-[11px] leading-5 text-fg-3">
            No review has corrected this topic. Merges and splits made here appear in this list with
            an undo action.
          </p>
        ) : (
          <ul className="space-y-2">
            {decisions.map((decision) => (
              <DecisionRow
                key={decision.id}
                decision={decision}
                labelForTopic={labelForTopic}
                busy={busy}
                onUndo={() => undo.mutate(decision)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** One audited decision, with the undo action only while it still applies. */
function DecisionRow({
  decision,
  labelForTopic,
  busy,
  onUndo,
}: {
  decision: TopicReviewDecision;
  labelForTopic: ReadonlyMap<string, string>;
  busy: boolean;
  onUndo: () => void;
}) {
  const summary = decisionSummary(decision, labelForTopic);
  return (
    <li className="space-y-1.5 rounded-lg border border-line p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge tone={decision.active ? "ok" : "neutral"}>
            {decision.active ? "Active" : "Undone"}
          </Badge>
          <span className="text-[11px] font-medium text-fg">
            {decision.operation === "merge" ? "Merged" : "Split"}
          </span>
        </div>
        <time className="mono shrink-0 text-[10.5px] text-fg-3" dateTime={decision.createdAt}>
          {timeOf(decision.createdAt)}
        </time>
      </div>
      <p className="break-words text-[11px] leading-5 text-fg-2">{summary.text}</p>
      <p className="break-words text-[11px] leading-5 text-fg-3">“{decision.note}”</p>
      {decision.active && (
        <Button variant="ghost" size="xs" disabled={busy} onClick={onUndo}>
          Undo this review
        </Button>
      )}
    </li>
  );
}

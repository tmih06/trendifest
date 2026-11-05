import { Badge, Button, cn } from "@trendifest/opendesk";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchEntity } from "../../shared/entities.ts";
import type { TopicEntity } from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import { TrendSparkline } from "@/components/sparkline";
import {
  ENTITY_KIND_FILTERS,
  NO_BASELINE_DETAIL,
  NO_BASELINE_LABEL,
  NO_RANK_DETAIL,
  PHASE_FILTERS,
  PHASE_LABELS,
  ROW_ENTITY_LIMIT,
  ROW_REASON_LIMIT,
  SORT_OPTIONS,
  filterEntries,
  indexEntityKinds,
  indexTopics,
  movementText,
  paginate,
  selectEntityOptions,
  sortEntries,
  type EntityKindFilter,
  type PhaseFilter,
  type SortKey,
} from "@/lib/board";
import { formatRelative } from "@/lib/format";

interface TopicBoardProps {
  topics: readonly TrendMapNode[];
  selectedId: string | null;
  sourceLabels: ReadonlyMap<string, string>;
  generatedAt: string;
  limited: boolean;
  detailsOpen: boolean;
  /** Deduplicated catalogue; rows reference it by the node's entity IDs. */
  entities: readonly TopicEntity[];
  /**
   * Global potential rank by topic ID, taken from the unfiltered map. Movement
   * and history are measured against whole-map ranks, so a source-scoped
   * snapshot cannot rebuild them; without this the board falls back to the
   * supplied order and labels the rank as scoped.
   */
  rankById?: ReadonlyMap<string, number>;
  onSelect: (id: string) => void;
  /** Follow actions ship independently; no control renders without a handler. */
  onWatchTopic?: (node: TrendMapNode) => void;
  onWatchEntity?: (entity: TopicEntity) => void;
}

/**
 * A readable alternative to canvas navigation. The caller supplies the same
 * potential-ranked, source/window-filtered snapshot as the graph. Pagination
 * bounds the DOM without inventing trend tiers or dropping full titles. Every
 * value comes from the enriched map in memory: rows never issue their own
 * requests, and a missing measurement stays explicitly missing.
 */
export function TopicBoard({
  topics,
  selectedId,
  sourceLabels,
  generatedAt,
  limited,
  detailsOpen,
  entities,
  rankById,
  onSelect,
  onWatchTopic,
  onWatchEntity,
}: TopicBoardProps) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [sort, setSort] = useState<SortKey>("potential");
  const [entityQuery, setEntityQuery] = useState("");
  const [entityKind, setEntityKind] = useState<EntityKindFilter>("all");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const sortNoteId = useId();
  const entityHelpId = useId();

  const entityById = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity])),
    [entities],
  );
  const selectedEntity = entityId ? (entityById.get(entityId) ?? null) : null;
  const kindById = useMemo(() => indexEntityKinds(entities), [entities]);
  const rankScope = rankById
    ? "Rank is the global potential position across all sources"
    : "Rank follows the current table order, which may be source-filtered";
  const indexed = useMemo(() => indexTopics(topics, rankById), [topics, rankById]);

  /** Catalogue entities used by the supplied snapshot, most referenced first. */
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of topics) {
      for (const id of node.entityIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [topics]);

  /** Catalogue order, most referenced by this snapshot first. Sorted once. */
  const orderedEntities = useMemo(
    () =>
      entities
        .filter((entity) => entityKind === "all" || entity.kind === entityKind)
        .sort(
          (a, b) =>
            (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.label.localeCompare(b.label, "vi"),
        ),
    [entities, entityKind, usage],
  );

  /**
   * A selection only counts while the catalogue still holds it and the kind
   * filter admits it. A stale ID (entity removed after a refresh) or a
   * cross-kind selection must not narrow the table while the select reads
   * "Any entity": the visible control and the applied filter always agree.
   */
  const appliedEntity = useMemo(
    () =>
      selectedEntity && (entityKind === "all" || selectedEntity.kind === entityKind)
        ? selectedEntity
        : null,
    [selectedEntity, entityKind],
  );
  const appliedEntityId = appliedEntity?.id ?? null;

  /**
   * The select never renders the whole catalogue: it shows the best-ranked
   * matches, keeps the active selection visible, and reports whether the query
   * matched anything. Alias scoring stays in shared/entities, so the board and
   * the inspector apply one rule set.
   */
  const entitySearch = useMemo(() => {
    const term = entityQuery.trim();
    return selectEntityOptions(
      orderedEntities,
      (entity) => !term || matchEntity(entity, term),
      appliedEntity,
    );
  }, [orderedEntities, entityQuery, appliedEntity]);

  const matches = useMemo(
    () =>
      sortEntries(
        filterEntries(indexed, {
          query,
          phase,
          entityId: appliedEntityId,
          kind: entityKind === "all" ? undefined : { value: entityKind, byId: kindById },
        }),
        sort,
      ),
    [indexed, query, phase, appliedEntityId, entityKind, kindById, sort],
  );
  const { page, lastPage, start, visible } = paginate(matches, requestedPage);
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Potential";
  const windowHours = topics[0]?.trend.windowHours ?? 6;
  const selectSort = (key: SortKey) => {
    setSort(key);
    setRequestedPage(0);
  };

  // Only the bounded table scrolls. Paging/filtering starts at its first result;
  // controls remain outside the scroller rather than covering focused rows.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [page, query, phase, sort, entityId, entityKind, entityQuery]);

  const entityHelp =
    entityQuery.trim() && entitySearch.matched === 0
      ? `No entity matches “${entityQuery.trim()}”.`
      : entitySearch.matched > entitySearch.options.length
        ? `${entitySearch.matched} entities match; the list shows the first ${entitySearch.options.length}. Refine the search to narrow it.`
        : "Search matches names, aliases and kinds. The rows follow the entity chosen below.";

  const filterClass =
    "block min-h-10 w-full rounded-md border border-line bg-surface px-3 py-2 " +
    "text-base text-fg placeholder:text-fg-3 sm:min-h-9 sm:text-sm";

  return (
    <div
      className="topic-board h-full min-h-0 overflow-y-auto overscroll-contain"
      data-details-open={detailsOpen}
    >
      <div className="mx-auto flex h-full min-h-[32rem] w-full flex-col gap-3 p-4">
        <div className="shrink-0 bg-surface">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-full max-w-sm text-xs font-medium text-fg-2">
              Search board topics
              <input
                type="search"
                value={query}
                placeholder="e.g. FPT, Olympia, Hà Nội"
                className={`mt-2 ${filterClass}`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setRequestedPage(0);
                }}
              />
            </label>
            <label className="block w-full max-w-40 text-xs font-medium text-fg-2">
              Phase
              <select
                value={phase}
                className={`mt-2 ${filterClass}`}
                onChange={(event) => {
                  setPhase(event.target.value as PhaseFilter);
                  setRequestedPage(0);
                }}
              >
                {PHASE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block w-full max-w-48 text-xs font-medium text-fg-2">
              Sort by
              <select
                value={sort}
                className={`mt-2 ${filterClass}`}
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                  setRequestedPage(0);
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <details className="min-w-0 w-full max-w-sm sm:w-auto">
              <summary className={`${filterClass} cursor-pointer text-xs font-medium`}>
                Entity filters{appliedEntity ? ` · ${appliedEntity.label}` : ""}
              </summary>
              <fieldset className="mt-3 min-w-0 w-full max-w-sm space-y-2 text-xs font-medium text-fg-2">
                <legend className="sr-only">Entity filters</legend>
                <div className="flex items-end gap-2">
                  <label className="block min-w-0 flex-1">
                    Find an entity
                    <input
                      type="search"
                      value={entityQuery}
                      placeholder="e.g. TP.HCM, OpenAI, GPT-5"
                      aria-describedby={entityHelpId}
                      className={`mt-2 ${filterClass}`}
                      onChange={(event) => {
                        setEntityQuery(event.target.value);
                        setRequestedPage(0);
                      }}
                    />
                  </label>
                  <label className="block w-36 shrink-0">
                    Kind
                    <select
                      value={entityKind}
                      className={`mt-2 ${filterClass}`}
                      onChange={(event) => {
                        const next = event.target.value as EntityKindFilter;
                        setEntityKind(next);
                        // A selection the new kind excludes is dropped rather than
                        // kept hidden and resurrected on the way back to All kinds.
                        if (next !== "all" && selectedEntity && selectedEntity.kind !== next) {
                          setEntityId(null);
                        }
                        setRequestedPage(0);
                      }}
                    >
                      {ENTITY_KIND_FILTERS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  Entity
                  <select
                    value={appliedEntityId ?? ""}
                    className={`mt-1 ${filterClass}`}
                    onChange={(event) => {
                      setEntityId(event.target.value || null);
                      setRequestedPage(0);
                    }}
                  >
                    <option value="">
                      {entityKind === "all" ? "Any entity" : "Any matched entity"}
                    </option>
                    {entitySearch.options.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {`${entity.label} · ${entity.kind}`}
                      </option>
                    ))}
                  </select>
                </label>
                <p id={entityHelpId} className="text-[11px] font-normal leading-4 text-fg-3">
                  {entityHelp}
                </p>
                {onWatchEntity && appliedEntity && (
                  <Button
                    variant="secondary"
                    title={`Follow ${appliedEntity.label} for new independent evidence alerts`}
                    onClick={() => onWatchEntity(appliedEntity)}
                  >
                    {`Follow ${appliedEntity.label}`}
                  </Button>
                )}
              </fieldset>
            </details>
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
        </div>
        <details className="shrink-0 text-xs leading-5 text-fg-3">
          <summary id={sortNoteId} className="cursor-pointer">
            Ranking and measurement · sorted by {sortLabel}
          </summary>
          <div className="mt-2 max-w-[92ch] space-y-2">
            <p>
              {rankScope}. Movement compares the current global rank with an actual observation at
              least {windowHours} hours ago. Direction compares independent support across two
              consecutive windows, requiring 12 hours of real hourly observations without a long
              gap. History shows up to 12 stored samples; unknown is not zero.
            </p>
            <p>
              New support counts fresh, source-dated accounts, publishers and providers, not
              audience or a growth percentage. Archive imports and activity-only forum timestamps
              cannot manufacture a rise. News attention and community momentum are separate breadth
              scores in this view, not verified fresh-post volume or virality.
            </p>
          </div>
        </details>
        <p className="shrink-0 text-xs text-fg-3">
          Scroll the table horizontally to see every column of the ranking.
        </p>
        <div
          ref={scroll}
          className="min-h-64 flex-1 overflow-auto overscroll-contain scroll-pt-20 rounded-lg border border-line"
          role="region"
          aria-label="Ranked topics table"
          tabIndex={0}
        >
          <table
            className="w-full min-w-[76rem] border-collapse text-start text-sm leading-normal"
            aria-describedby={sortNoteId}
          >
            <caption className="sr-only">
              Topics with measured direction, attention and support. {rankScope}. Computed{" "}
              {formatRelative(generatedAt)}. Potential is a heuristic, not measured virality.
              {limited && " A bounded sample of up to 1,500 topics."}
            </caption>
            <thead className="sticky top-0 z-10 bg-sunken text-xs text-fg-2">
              <tr>
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  Rank
                </th>
                <th scope="col" className="min-w-64 px-3 py-3 text-start font-medium">
                  Topic
                </th>
                <SortableHeader
                  label="Movement"
                  sortKey="movement"
                  active={sort}
                  onSort={selectSort}
                  align="start"
                  className="min-w-28"
                />
                <th scope="col" className="px-3 py-3 text-start font-medium">
                  History
                </th>
                <SortableHeader
                  label="Potential (0–100)"
                  sortKey="potential"
                  active={sort}
                  onSort={selectSort}
                  align="end"
                />
                <SortableHeader
                  label="New support"
                  sortKey="support"
                  active={sort}
                  onSort={selectSort}
                  align="end"
                  className="min-w-32"
                />
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
                <SortableHeader
                  label="News attention (0–100)"
                  sortKey="news"
                  active={sort}
                  onSort={selectSort}
                  align="end"
                />
                <SortableHeader
                  label="Community momentum (0–100)"
                  sortKey="community"
                  active={sort}
                  onSort={selectSort}
                  align="end"
                />
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
              {visible.map(({ node, rank }) => {
                const own = node.entityIds
                  .map((id) => entityById.get(id))
                  .filter((entity): entity is TopicEntity => entity !== undefined);
                return (
                  <tr
                    key={node.id}
                    className={cn(
                      "border-t border-line align-top hover:bg-hover",
                      selectedId === node.id && "bg-active",
                    )}
                  >
                    <td className="mono px-3 py-3 text-end text-xs tabular-nums text-fg-3">
                      {rank}
                    </td>
                    <th scope="row" className="px-3 py-3 text-start font-medium text-fg" lang="vi">
                      <button
                        type="button"
                        className={
                          "min-h-6 w-full max-w-[32rem] break-words text-start " +
                          "underline decoration-transparent underline-offset-4 hover:decoration-current"
                        }
                        aria-pressed={selectedId === node.id}
                        onClick={() => onSelect(node.id)}
                      >
                        {node.label}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={node.trend.phase === "rising" ? "ok" : "neutral"}>
                          {PHASE_LABELS[node.trend.phase]}
                        </Badge>
                        {own.slice(0, ROW_ENTITY_LIMIT).map((entity) => (
                          <button
                            key={entity.id}
                            type="button"
                            className={
                              "inline-flex min-h-6 items-center rounded-md border border-line px-2 " +
                              "text-[10.5px] font-normal leading-4 text-fg-2 hover:bg-hover"
                            }
                            aria-label={`${entity.label}: filter the board to this ${entity.kind}`}
                            aria-pressed={entityId === entity.id}
                            title={
                              entity.aliases.length > 0
                                ? `${entity.kind} · also: ${entity.aliases.join(", ")}`
                                : entity.kind
                            }
                            onClick={() => {
                              // A chip means "topics carrying this entity", not
                              // "every entity of this kind", so it clears the
                              // kind filter and stays selected in the list.
                              setEntityId(entityId === entity.id ? null : entity.id);
                              setEntityKind("all");
                              setRequestedPage(0);
                            }}
                          >
                            {entity.label}
                          </button>
                        ))}
                        {own.length > ROW_ENTITY_LIMIT && (
                          <span
                            className="text-[10.5px] font-normal text-fg-3"
                            title={own
                              .slice(ROW_ENTITY_LIMIT)
                              .map((entity) => entity.label)
                              .join(", ")}
                          >
                            {`+${own.length - ROW_ENTITY_LIMIT} more`}
                          </span>
                        )}
                      </div>
                    </th>
                    <td className="px-3 py-3">
                      <MovementCell node={node} />
                    </td>
                    <td className="px-3 py-3">
                      <TrendSparkline points={node.trend.history} />
                    </td>
                    <td className="px-3 py-3 text-end">
                      <Badge
                        tone={node.potential >= 60 ? "ok" : "neutral"}
                        className="mono tabular-nums"
                      >
                        {node.potential}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-end">
                      <SupportCell node={node} />
                    </td>
                    <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                      {node.authors}
                    </td>
                    <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                      {node.discussionPosts}
                    </td>
                    <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                      {node.publishers}
                    </td>
                    <td className="mono px-3 py-3 text-end tabular-nums text-fg-2">
                      {node.newsPosts}
                    </td>
                    <td className="mono px-3 py-3 text-end text-xs tabular-nums text-fg-2">
                      {node.attention.news}
                    </td>
                    <td className="mono px-3 py-3 text-end text-xs tabular-nums text-fg-2">
                      {node.attention.community}
                    </td>
                    <td className="px-3 py-3 text-xs text-fg-2">
                      {node.segments.map((id) => sourceLabels.get(id) ?? id).join(" · ")}
                    </td>
                    <td className="px-3 py-3 text-xs text-fg-3">
                      {formatRelative(node.lastSeenAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`View evidence: ${node.label}`}
                          onClick={() => onSelect(node.id)}
                        >
                          View evidence
                        </Button>
                        {onWatchTopic && (
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`Follow topic: ${node.label}`}
                            onClick={() => onWatchTopic(node)}
                          >
                            Follow
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length > 0 && (
          <nav
            aria-label="Topic board pages, table end"
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              variant="secondary"
              disabled={page === 0}
              onClick={() => setRequestedPage(page - 1)}
            >
              Previous
            </Button>
            <span className="mono text-xs tabular-nums text-fg-2">
              {`Page ${page + 1} of ${lastPage + 1}`}
            </span>
            <Button
              variant="secondary"
              disabled={page === lastPage}
              onClick={() => setRequestedPage(page + 1)}
            >
              Next
            </Button>
          </nav>
        )}
        {matches.length === 0 && (
          <div className="space-y-3 rounded-xl border border-line p-6">
            {topics.length === 0 ? (
              <p className="text-sm text-fg-2">
                No topics are available yet. Collection has not produced this ranking.
              </p>
            ) : (
              <>
                <p className="text-sm text-fg-2">
                  No board topic matches the current search and filters. Clear them to see the
                  ranking.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setPhase("all");
                    setEntityQuery("");
                    setEntityKind("all");
                    setEntityId(null);
                    setRequestedPage(0);
                  }}
                >
                  Clear filters
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A column header that is also the sort control, so pointer and keyboard users
 * reach the same ranking and `aria-sort` always describes the current ordering.
 */
function SortableHeader({
  label,
  sortKey,
  active,
  onSort,
  align,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  onSort: (key: SortKey) => void;
  align: "start" | "end";
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      scope="col"
      aria-sort={isActive ? "descending" : "none"}
      className={cn(
        "px-3 py-3 font-medium",
        align === "end" ? "text-end" : "text-start",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex min-h-6 items-center gap-1 whitespace-nowrap hover:text-fg",
          isActive && "text-fg",
        )}
        aria-label={isActive ? `Sort by ${label}, already highest first` : `Sort by ${label}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span aria-hidden="true" className={cn("text-fg-3", !isActive && "opacity-30")}>
          ↓
        </span>
      </button>
    </th>
  );
}

/**
 * Measured rank movement, or the explicit absence of a comparable baseline. The
 * reason list mounts only while the disclosure is open, so 80 rows never carry
 * hidden bullet lists.
 */
function MovementCell({ node }: { node: TrendMapNode }) {
  const { rankChange, previousRank, reasons } = node.trend;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      {rankChange === null ? (
        // Explicit absence, never a zero movement: the phase badge and History
        // column say "Insufficient history" in full.
        <span className="text-[11px] leading-4 text-fg-3" title={NO_RANK_DETAIL}>
          <span aria-hidden="true">{NO_BASELINE_LABEL}</span>
          <span className="sr-only">{`${NO_BASELINE_LABEL}: ${NO_RANK_DETAIL}`}</span>
        </span>
      ) : (
        <span
          className="mono text-xs tabular-nums text-fg-2"
          title={previousRank === null ? undefined : `Previous rank ${previousRank}`}
        >
          <span aria-hidden="true">
            {rankChange > 0 ? `↑${rankChange}` : rankChange < 0 ? `↓${-rankChange}` : "0"}
          </span>
          <span className="sr-only">{movementText(rankChange)}</span>
        </span>
      )}
      {reasons.length > 0 && (
        <details
          className="text-[11px] text-fg-3"
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary className="inline-flex min-h-6 cursor-pointer items-center">
            {`Why (${reasons.length})`}
          </summary>
          {open && (
            <ul className="mt-1 w-48 max-w-[60vw] list-disc space-y-1 break-words ps-4 leading-4 text-fg-2">
              {reasons.slice(0, ROW_REASON_LIMIT).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
              {reasons.length > ROW_REASON_LIMIT && (
                <li>Open the inspector for the full explanation.</li>
              )}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

/** New independent support only exists when two comparable windows exist. */
function SupportCell({ node }: { node: TrendMapNode }) {
  const { comparable, newAccounts, newPublishers, newSources, windowHours } = node.trend;
  if (!comparable) {
    return (
      <span className="text-[11px] leading-4 text-fg-3" title={NO_BASELINE_DETAIL}>
        <span aria-hidden="true">{NO_BASELINE_LABEL}</span>
        <span className="sr-only">{`${NO_BASELINE_LABEL}: ${NO_BASELINE_DETAIL}`}</span>
      </span>
    );
  }
  return (
    <span
      className="mono block text-xs leading-4 tabular-nums text-fg-2"
      title={`New independent accounts, publishers and sources in the last ${windowHours}h`}
    >
      <span aria-hidden="true">
        {`+${newAccounts} acc`}
        {` · +${newPublishers} pub`}
        {newSources.length > 0 ? ` · +${newSources.length} src` : ""}
      </span>
      <span className="sr-only">
        {`${newAccounts} new independent accounts, ${newPublishers} new publishers, ${newSources.length} new sources`}
      </span>
    </span>
  );
}

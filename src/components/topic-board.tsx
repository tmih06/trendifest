import { Badge, Button, cn } from "@trendifest/opendesk";
import BellPlus from "lucide-react/icons/bell-plus";
import ChevronLeft from "lucide-react/icons/chevron-left";
import ChevronRight from "lucide-react/icons/chevron-right";
import HelpCircle from "lucide-react/icons/help-circle";
import PanelRightOpen from "lucide-react/icons/panel-right-open";
import Search from "lucide-react/icons/search";
import SlidersHorizontal from "lucide-react/icons/sliders-horizontal";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchEntity } from "../../shared/entities.ts";
import type { TopicEntity } from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import { TrendSparkline } from "@/components/sparkline";
import {
  ENTITY_KIND_FILTERS,
  ENTITY_KIND_LABELS,
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
 * Bảng xếp hạng chủ đề gọn nhẹ thay thế cho điều hướng trên đồ thị. Toàn bộ
 * số liệu đọc trực tiếp từ ảnh chụp đồ thị trong bộ nhớ và gói gọn để vừa màn
 * hình laptop chuẩn mà không cần cuộn ngang.
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
    ? "Thứ hạng là vị trí tiềm năng toàn cục trên tất cả nguồn"
    : "Thứ hạng theo thứ tự bảng hiện tại (có thể đã lọc theo nguồn)";
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

  const appliedEntity = useMemo(
    () =>
      selectedEntity && (entityKind === "all" || selectedEntity.kind === entityKind)
        ? selectedEntity
        : null,
    [selectedEntity, entityKind],
  );
  const appliedEntityId = appliedEntity?.id ?? null;

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
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Tiềm năng";
  const windowHours = topics[0]?.trend.windowHours ?? 6;
  const selectSort = (key: SortKey) => {
    setSort(key);
    setRequestedPage(0);
  };

  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [page, query, phase, sort, entityId, entityKind, entityQuery]);

  const entityHelp =
    entityQuery.trim() && entitySearch.matched === 0
      ? `Không tìm thấy thực thể khớp “${entityQuery.trim()}”.`
      : entitySearch.matched > entitySearch.options.length
        ? `Có ${entitySearch.matched} thực thể khớp; đang hiện ${entitySearch.options.length} kết quả đầu.`
        : "Tìm theo tên, bí danh và loại thực thể.";

  const controlClass =
    "h-8 rounded-md border border-line bg-surface px-2.5 text-base text-fg " +
    "placeholder:text-fg-3 focus-visible:outline-2 focus-visible:outline-focus-line sm:text-xs";

  const hasActiveFilters =
    query.trim() !== "" || phase !== "all" || appliedEntityId !== null || entityKind !== "all";

  return (
    <div
      className="topic-board flex h-full min-h-0 flex-col overflow-hidden"
      data-details-open={detailsOpen}
    >
      {/* Thanh lọc & phân trang một dòng gọn */}
      <div className="shrink-0 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1 sm:max-w-60">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-3"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Tìm chủ đề trong bảng"
              value={query}
              placeholder="Tìm chủ đề…"
              className={`${controlClass} w-full ps-8`}
              onChange={(event) => {
                setQuery(event.target.value);
                setRequestedPage(0);
              }}
            />
          </div>

          <select
            aria-label="Lọc theo giai đoạn"
            value={phase}
            className={`${controlClass} w-40`}
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

          <select
            aria-label="Sắp xếp theo"
            value={sort}
            className={`${controlClass} w-44`}
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

          <details className="relative">
            <summary
              className={cn(
                "inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-fg-2 hover:bg-hover hover:text-fg [&::-webkit-details-marker]:hidden",
                (appliedEntity || entityKind !== "all") && "border-line-strong bg-active text-fg",
              )}
            >
              <SlidersHorizontal className="size-3.5 text-fg-3" aria-hidden="true" />
              <span className="max-w-32 truncate">
                {appliedEntity ? appliedEntity.label : "Thực thể"}
              </span>
            </summary>
            <fieldset className="mt-1.5 w-72 max-w-[calc(100vw-2rem)] space-y-2.5 rounded-lg border border-line bg-raised p-3 text-xs font-medium text-fg-2 shadow-float sm:absolute sm:start-0 sm:top-full sm:z-30 sm:w-80">
              <legend className="sr-only">Bộ lọc thực thể</legend>
              <div className="flex items-end gap-2">
                <label className="block min-w-0 flex-1">
                  Tìm thực thể
                  <input
                    type="search"
                    value={entityQuery}
                    placeholder="TP.HCM, OpenAI, GPT-5"
                    aria-describedby={entityHelpId}
                    className={`${controlClass} mt-1 w-full`}
                    onChange={(event) => {
                      setEntityQuery(event.target.value);
                      setRequestedPage(0);
                    }}
                  />
                </label>
                <label className="block w-32 shrink-0">
                  Loại
                  <select
                    value={entityKind}
                    className={`${controlClass} mt-1 w-full`}
                    onChange={(event) => {
                      const next = event.target.value as EntityKindFilter;
                      setEntityKind(next);
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
                Thực thể
                <select
                  value={appliedEntityId ?? ""}
                  className={`${controlClass} mt-1 w-full`}
                  onChange={(event) => {
                    setEntityId(event.target.value || null);
                    setRequestedPage(0);
                  }}
                >
                  <option value="">
                    {entityKind === "all" ? "Mọi thực thể" : "Mọi thực thể khớp"}
                  </option>
                  {entitySearch.options.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {`${entity.label} · ${ENTITY_KIND_LABELS[entity.kind]}`}
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
                  size="xs"
                  title={`Theo dõi ${appliedEntity.label} để nhận cảnh báo bằng chứng mới`}
                  onClick={() => onWatchEntity(appliedEntity)}
                >
                  {`Theo dõi ${appliedEntity.label}`}
                </Button>
              )}
            </fieldset>
          </details>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setQuery("");
                setPhase("all");
                setEntityQuery("");
                setEntityKind("all");
                setEntityId(null);
                setRequestedPage(0);
              }}
            >
              Đặt lại
            </Button>
          )}

          <div className="ms-auto flex items-center gap-2">
            <details className="relative">
              <summary
                id={sortNoteId}
                aria-label={`Phương pháp xếp hạng · sắp theo ${sortLabel}`}
                className="inline-flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-fg [&::-webkit-details-marker]:hidden"
                title={`Phương pháp xếp hạng · sắp theo ${sortLabel}`}
              >
                <HelpCircle className="size-3.5" aria-hidden="true" />
              </summary>
              <div className="mt-1.5 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border border-line bg-raised p-3 text-[11.5px] leading-4 text-fg-2 shadow-float sm:absolute sm:end-0 sm:top-full sm:z-30 sm:w-96">
                <p className="font-medium text-fg">Xếp hạng &amp; đo lường ({sortLabel})</p>
                <p>
                  {rankScope}. Biến động hạng so sánh vị trí toàn cục hiện tại với quan sát cách đây
                  ít nhất {windowHours} giờ. Hướng xu hướng cần tối thiểu 12 giờ quan sát liên tục.
                </p>
                <p>
                  Bằng chứng mới đếm tài khoản, tòa soạn và nguồn độc lập mới xuất hiện. Độ phủ báo
                  chí và sức nóng cộng đồng là điểm bề rộng, không phải lượt xem hay độ lan truyền.
                </p>
              </div>
            </details>

            <nav aria-label="Phân trang bảng chủ đề" className="flex items-center gap-1">
              <span role="status" className="mono me-1 text-[11px] tabular-nums text-fg-3">
                {matches.length
                  ? `${start + 1}–${start + visible.length} / ${matches.length}`
                  : "0"}
              </span>
              <Button
                variant="ghost"
                size="xs"
                square
                aria-label="Trang trước"
                disabled={page === 0}
                onClick={() => setRequestedPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                square
                aria-label="Trang sau"
                disabled={page === lastPage}
                onClick={() => setRequestedPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </nav>
          </div>
        </div>
      </div>

      {/* Bảng chính: vừa khít chiều ngang màn hình laptop chuẩn */}
      <div className="min-h-0 flex-1 p-3 sm:p-4">
        {matches.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-line bg-surface p-6">
            {topics.length === 0 ? (
              <p className="text-sm text-fg-2">
                Chưa có chủ đề nào. Hệ thống thu thập chưa tạo bảng xếp hạng này.
              </p>
            ) : (
              <>
                <p className="text-sm text-fg-2">
                  Không có chủ đề nào khớp với tìm kiếm và bộ lọc hiện tại.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setPhase("all");
                    setEntityQuery("");
                    setEntityKind("all");
                    setEntityId(null);
                    setRequestedPage(0);
                  }}
                >
                  Xóa bộ lọc
                </Button>
              </>
            )}
          </div>
        ) : (
          <div
            ref={scroll}
            className="h-full min-h-0 overflow-auto overscroll-contain scroll-pt-10 rounded-lg border border-line bg-surface"
            role="region"
            aria-label="Bảng xếp hạng chủ đề"
            tabIndex={0}
          >
            <table
              className="w-full border-collapse text-start text-[13px] leading-snug"
              aria-describedby={sortNoteId}
            >
              <caption className="sr-only">
                Bảng chủ đề kèm hướng xu hướng, độ phủ và bằng chứng. {rankScope}. Cập nhật{" "}
                {formatRelative(generatedAt)}. Điểm tiềm năng là chỉ số ước lượng, không phải độ lan
                truyền thực tế.
                {limited && " Mẫu giới hạn tối đa 1.500 chủ đề."}
              </caption>
              <thead className="sticky top-0 z-10 border-b border-line bg-sunken text-[11px] text-fg-3">
                <tr>
                  <th scope="col" className="w-9 px-2.5 py-2 text-end font-medium">
                    #
                  </th>
                  <th scope="col" className="min-w-48 px-2.5 py-2 text-start font-medium">
                    Chủ đề
                  </th>
                  <th scope="col" className="w-[70px] px-2 py-2 text-start font-medium">
                    Xu hướng
                  </th>
                  <SortableHeader
                    label="Tiềm năng"
                    sortKey="potential"
                    active={sort}
                    onSort={selectSort}
                    align="end"
                    className="w-20"
                  />
                  <SortableHeader
                    label="Biến động"
                    sortKey="movement"
                    active={sort}
                    onSort={selectSort}
                    align="end"
                    className="w-20"
                  />
                  <SortableHeader
                    label="Báo chí"
                    sortKey="news"
                    active={sort}
                    onSort={selectSort}
                    align="end"
                    className="w-[72px]"
                  />
                  <SortableHeader
                    label="Cộng đồng"
                    sortKey="community"
                    active={sort}
                    onSort={selectSort}
                    align="end"
                    className="w-20"
                  />
                  <SortableHeader
                    label="Mới"
                    sortKey="support"
                    active={sort}
                    onSort={selectSort}
                    align="end"
                    className="w-[72px]"
                  />
                  <th scope="col" className="w-16 px-2 py-2 text-end font-medium">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map(({ node, rank }) => {
                  const own = node.entityIds
                    .map((id) => entityById.get(id))
                    .filter((entity): entity is TopicEntity => entity !== undefined);
                  const sourceText = node.segments
                    .map((id) => sourceLabels.get(id) ?? id)
                    .join(" · ");
                  return (
                    <tr
                      key={node.id}
                      className={cn(
                        "align-top transition-colors duration-100 hover:bg-hover",
                        selectedId === node.id && "bg-active",
                      )}
                    >
                      <td className="mono px-2.5 py-2.5 text-end text-[11.5px] tabular-nums text-fg-3">
                        {rank}
                      </td>
                      <th
                        scope="row"
                        className="px-2.5 py-2.5 text-start font-medium text-fg"
                        lang="vi"
                      >
                        <button
                          type="button"
                          className="w-full break-words text-start text-[13px] font-medium leading-snug text-fg underline decoration-transparent underline-offset-3 hover:decoration-current"
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
                              className={cn(
                                "inline-flex h-5 items-center rounded border px-1.5 text-[10.5px] font-normal leading-none transition-colors",
                                entityId === entity.id
                                  ? "border-line-strong bg-active text-fg"
                                  : "border-line text-fg-2 hover:bg-hover hover:text-fg",
                              )}
                              aria-label={`${entity.label}: lọc bảng theo ${ENTITY_KIND_LABELS[entity.kind].toLowerCase()}`}
                              aria-pressed={entityId === entity.id}
                              title={
                                entity.aliases.length > 0
                                  ? `${ENTITY_KIND_LABELS[entity.kind]} · còn gọi: ${entity.aliases.join(", ")}`
                                  : ENTITY_KIND_LABELS[entity.kind]
                              }
                              onClick={() => {
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
                              {`+${own.length - ROW_ENTITY_LIMIT}`}
                            </span>
                          )}
                          <span className="text-[11px] font-normal text-fg-3">
                            {sourceText} · {formatRelative(node.lastSeenAt)}
                          </span>
                        </div>
                      </th>
                      <td className="px-2 py-2.5">
                        <TrendSparkline points={node.trend.history} />
                      </td>
                      <td className="px-2 py-2.5 text-end">
                        <Badge
                          tone={node.potential >= 60 ? "ok" : "neutral"}
                          className="mono tabular-nums"
                        >
                          {node.potential}
                        </Badge>
                      </td>
                      <td className="px-2 py-2.5 text-end">
                        <MovementCell node={node} />
                      </td>
                      <td
                        className="px-2 py-2.5 text-end"
                        title={`Độ phủ báo chí ${node.attention.news}/100 · ${node.publishers} tòa soạn · ${node.newsPosts} bài`}
                      >
                        <div className="mono text-[12px] font-medium tabular-nums text-fg">
                          {node.attention.news}
                        </div>
                        <div className="mono text-[10.5px] tabular-nums text-fg-3">
                          {`${node.publishers} báo · ${node.newsPosts} bài`}
                        </div>
                      </td>
                      <td
                        className="px-2 py-2.5 text-end"
                        title={`Sức nóng cộng đồng ${node.attention.community}/100 · ${node.authors} tài khoản · ${node.discussionPosts} bài`}
                      >
                        <div className="mono text-[12px] font-medium tabular-nums text-fg">
                          {node.attention.community}
                        </div>
                        <div className="mono text-[10.5px] tabular-nums text-fg-3">
                          {`${node.authors} TK · ${node.discussionPosts} bài`}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-end">
                        <SupportCell node={node} />
                      </td>
                      <td className="px-2 py-2.5 text-end">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            square
                            aria-label={`Xem bằng chứng: ${node.label}`}
                            title="Xem bằng chứng"
                            onClick={() => onSelect(node.id)}
                          >
                            <PanelRightOpen />
                          </Button>
                          {onWatchTopic && (
                            <Button
                              variant="ghost"
                              size="xs"
                              square
                              aria-label={`Theo dõi chủ đề: ${node.label}`}
                              title="Theo dõi chủ đề"
                              onClick={() => onWatchTopic(node)}
                            >
                              <BellPlus />
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
        )}
      </div>
    </div>
  );
}

/**
 * Tiêu đề cột kiêm nút sắp xếp để người dùng chuột và bàn phím dùng chung một
 * cơ chế xếp hạng và `aria-sort` luôn phản ánh thứ tự hiện tại.
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
        "px-2 py-2 font-medium",
        align === "end" ? "text-end" : "text-start",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-0.5 whitespace-nowrap hover:text-fg",
          isActive && "text-fg",
        )}
        aria-label={
          isActive ? `Sắp xếp theo ${label}, đang xếp cao nhất trước` : `Sắp xếp theo ${label}`
        }
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

/** Biến động thứ hạng đo được, hoặc dấu gạch khi chưa có mốc đối chiếu. */
function MovementCell({ node }: { node: TrendMapNode }) {
  const { rankChange, previousRank, reasons } = node.trend;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-0.5">
      {rankChange === null ? (
        <span className="text-xs text-fg-3" title={NO_RANK_DETAIL}>
          <span aria-hidden="true">—</span>
          <span className="sr-only">{`${NO_BASELINE_LABEL}: ${NO_RANK_DETAIL}`}</span>
        </span>
      ) : (
        <span
          className="mono text-xs tabular-nums text-fg-2"
          title={previousRank === null ? undefined : `Hạng trước đó: ${previousRank}`}
        >
          <span aria-hidden="true">
            {rankChange > 0 ? `↑${rankChange}` : rankChange < 0 ? `↓${-rankChange}` : "0"}
          </span>
          <span className="sr-only">{movementText(rankChange)}</span>
        </span>
      )}
      {reasons.length > 0 && (
        <details
          className="text-[10.5px] text-fg-3"
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-2 hover:text-fg [&::-webkit-details-marker]:hidden">
            {`Lý do (${reasons.length})`}
          </summary>
          {open && (
            <ul className="mt-1 w-48 max-w-[60vw] list-disc space-y-1 break-words ps-4 text-start leading-4 text-fg-2">
              {reasons.slice(0, ROW_REASON_LIMIT).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
              {reasons.length > ROW_REASON_LIMIT && (
                <li>Mở bảng chi tiết để xem giải thích đầy đủ.</li>
              )}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

/** Bằng chứng độc lập mới chỉ có khi tồn tại hai cửa sổ đối chiếu. */
function SupportCell({ node }: { node: TrendMapNode }) {
  const { comparable, newAccounts, newPublishers, newSources, windowHours } = node.trend;
  if (!comparable) {
    return (
      <span className="text-xs text-fg-3" title={NO_BASELINE_DETAIL}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{`${NO_BASELINE_LABEL}: ${NO_BASELINE_DETAIL}`}</span>
      </span>
    );
  }
  return (
    <div
      className="mono text-[11px] leading-4 tabular-nums text-fg-2"
      title={`Tài khoản, tòa soạn và nguồn độc lập mới trong ${windowHours} giờ qua`}
    >
      <div aria-hidden="true">{`+${newAccounts} TK · +${newPublishers} báo`}</div>
      {newSources.length > 0 && (
        <div aria-hidden="true" className="text-[10.5px] text-fg-3">
          {`+${newSources.length} nguồn`}
        </div>
      )}
      <span className="sr-only">
        {`${newAccounts} tài khoản mới, ${newPublishers} tòa soạn mới, ${newSources.length} nguồn mới`}
      </span>
    </div>
  );
}

import { Badge, Button, cn } from "@trendifest/opendesk";
import Bell from "lucide-react/icons/bell";
import Check from "lucide-react/icons/check";
import Eye from "lucide-react/icons/eye";
import Pencil from "lucide-react/icons/pencil";
import Plus from "lucide-react/icons/plus";
import RefreshCw from "lucide-react/icons/refresh-cw";
import Trash2 from "lucide-react/icons/trash-2";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TopicAlert, TopicEntity, WatchDraft, WatchRule } from "../../shared/intelligence.ts";
import type { TrendMapNode } from "../../shared/types.ts";
import {
  useDeleteWatchRule,
  useMarkAlertRead,
  useSaveWatchRule,
  useWatchlists,
} from "@/hooks/use-watchlists";
import { formatRelative } from "@/lib/format";
import {
  ENTITY_KIND_LABELS,
  ENTITY_OPTION_LIMIT,
  TOPIC_OPTION_LIMIT,
  WATCH_RETENTION,
  draftToInput,
  entityChoices,
  filterEntityChoices,
  filterTopicChoices,
  inputToForm,
  ruleToForm,
  thresholdSummary,
  toWatchInput,
  topicChoices,
  type WatchFormValues,
} from "@/lib/watchlist";

const FIELD_CLASS =
  "mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-2 text-base text-fg placeholder:text-fg-3 xl:text-[12px]";

const EMPTY_FORM: WatchFormValues = {
  kind: "topic",
  targetId: "",
  label: "",
  enabled: true,
  minNewAccounts: "0",
  minNewPublishers: "2",
  minNewSources: "0",
  minPotential: "40",
};

function ThresholdField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] text-fg-3">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD_CLASS, "mono mt-1")}
      />
      <p className="mt-1 text-[10.5px] leading-4 text-fg-3">{hint}</p>
    </div>
  );
}

function AlertCard({
  alert,
  topic,
  onOpenTopic,
  onMarkRead,
  busy,
}: {
  alert: TopicAlert;
  topic: TrendMapNode | null;
  onOpenTopic: (id: string) => void;
  onMarkRead: (id: string) => void;
  busy: boolean;
}) {
  const unread = alert.readAt === null;
  return (
    <li
      className={cn(
        "rounded-lg border border-line p-3",
        unread && "border-line-strong bg-hover/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[12px] leading-5 text-fg">{alert.topicLabel}</p>
          <p className="mt-0.5 text-[10.5px] leading-4 text-fg-3">
            {alert.watchLabel} · {formatRelative(alert.createdAt)}
          </p>
        </div>
        {unread ? (
          <Badge tone="ok" dot>
            New
          </Badge>
        ) : null}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-fg-3">
        <div className="flex gap-1">
          <dt>Accounts</dt>
          <dd className="mono text-fg-2">{alert.newAccounts}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Publishers</dt>
          <dd className="mono text-fg-2">{alert.newPublishers}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Sources</dt>
          <dd className="mono text-fg-2">{alert.newSources.length}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Potential</dt>
          <dd className="mono text-fg-2">{alert.potential}/100</dd>
        </div>
      </dl>
      {alert.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[10.5px] leading-4 text-fg-3">
          {alert.reasons.map((reason) => (
            <li key={reason} className="break-words">
              {reason}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button
          size="xs"
          variant="secondary"
          icon={<Eye />}
          onClick={() => onOpenTopic(alert.topicId)}
        >
          {topic ? "Open topic" : "Open retained evidence"}
        </Button>
        {!topic && (
          <span className="text-[10.5px] text-fg-3">Outside the current graph sample</span>
        )}
        {unread && (
          <Button
            size="xs"
            variant="ghost"
            icon={<Check />}
            loading={busy}
            onClick={() => onMarkRead(alert.id)}
          >
            Mark read
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Single-user watch management and the in-app notification history.
 *
 * Every number shown here is stored server state; the panel never fabricates a
 * sample alert or a placeholder topic. Thresholds are explained in the same
 * words the evaluator uses: growth dimensions are OR-ed, the potential floor is
 * required, and only identities seen for the first time after the previous
 * check count.
 */
export function WatchlistPanel({
  topics,
  entities,
  draft,
  onDraftConsumed,
  onSelectTopic,
}: {
  topics: readonly TrendMapNode[];
  entities: readonly TopicEntity[];
  draft: WatchDraft | null;
  onDraftConsumed: () => void;
  onSelectTopic: (id: string) => void;
}) {
  const [historyCursors, setHistoryCursors] = useState<string[]>([]);
  const before = historyCursors.at(-1);
  const lists = useWatchlists(true, before);
  const save = useSaveWatchRule();
  const remove = useDeleteWatchRule();
  const read = useMarkAlertRead();

  const ids = useId();
  const [form, setForm] = useState<WatchFormValues | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const rulesHeading = useRef<HTMLHeadingElement>(null);
  const openedForm = useRef(false);
  const alertsHeading = useRef<HTMLHeadingElement>(null);
  const previousCursor = useRef(before);

  const nodesById = useMemo(() => new Map(topics.map((node) => [node.id, node])), [topics]);

  const topicOptions = useMemo(() => topicChoices(topics), [topics]);
  const entityOptions = useMemo(() => entityChoices(entities), [entities]);

  const filteredTopics = useMemo(
    () => filterTopicChoices(topics, targetQuery, form?.targetId ?? ""),
    [topics, targetQuery, form?.targetId],
  );

  const filteredEntities = useMemo(
    () => filterEntityChoices(entities, targetQuery, form?.targetId ?? ""),
    [entities, targetQuery, form?.targetId],
  );

  // A Follow action hands in a prefilled rule; it is consumed exactly once, so
  // re-rendering the panel cannot reopen the form behind the reader's back.
  useEffect(() => {
    if (!draft) return;
    setForm(inputToForm(draftToInput(draft)));
    setEditingId(null);
    setTargetQuery("");
    setFormError(null);
    setNotice(`Ready to follow “${draft.label}”. Review the thresholds and save.`);
    onDraftConsumed();
  }, [draft, onDraftConsumed]);

  // Move focus to the form once it exists. Doing it in the click handler would
  // target an element that has not rendered yet, leaving keyboard users behind.
  useEffect(() => {
    if (form && !openedForm.current) formHeading.current?.focus();
    openedForm.current = form !== null;
  }, [form]);

  // Paging changes the evidence list, not the rule form. Keep keyboard focus at
  // the notification heading instead of stranding it below hundreds of cards.
  useEffect(() => {
    if (previousCursor.current === before) return;
    previousCursor.current = before;
    alertsHeading.current?.focus();
    alertsHeading.current?.scrollIntoView({ block: "start" });
  }, [before]);

  const beginCreate = () => {
    const first = topicOptions[0];
    setForm(first ? { ...EMPTY_FORM, targetId: first.id, label: first.label } : { ...EMPTY_FORM });
    setEditingId(null);
    setTargetQuery("");
    setFormError(null);
    setNotice(null);
  };

  const beginEdit = (rule: WatchRule) => {
    setForm(ruleToForm(rule));
    setEditingId(rule.id);
    setTargetQuery("");
    setFormError(null);
    setNotice(null);
  };

  const submit = () => {
    if (!form) return;
    const input = toWatchInput(form);
    if (!input) {
      setFormError(
        "Set at least one growth threshold above zero, and keep every number between 0 and 100.",
      );
      return;
    }
    if (!input.targetId || !input.label) {
      setFormError("Choose a topic or entity to follow.");
      return;
    }
    setFormError(null);
    save.mutate(
      { id: editingId ?? undefined, input },
      {
        onSuccess: (rule) => {
          setForm(null);
          setEditingId(null);
          // The form is gone, so focus would fall back to the document.
          rulesHeading.current?.focus();
          setNotice(
            editingId
              ? `Updated “${rule.label}”. Its baseline keeps the identities already counted.`
              : `Following “${rule.label}”. Existing records are baseline evidence, so the first alert needs genuinely new support.`,
          );
        },
      },
    );
  };

  const chooseTarget = (value: string) => {
    if (!form) return;
    if (form.kind === "topic") {
      const node = nodesById.get(value);
      setForm({ ...form, targetId: value, label: node?.label ?? form.label });
      return;
    }
    const entity = entities.find((item) => item.id === value);
    setForm({ ...form, targetId: value, label: entity?.label ?? form.label });
  };

  const busy = save.isPending || remove.isPending;
  const alerts = lists.alerts;
  const rules = lists.rules;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-fg">
            <Bell className="size-4 text-fg-3" aria-hidden="true" />
            Watchlists
          </h2>
          <p className="mt-1 max-w-[60ch] text-[12px] leading-5 text-fg-3">
            Alerts appear here inside the app. They are computed from collected records only and
            never leave this workspace: no email, webhook, or OS notification is sent.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {lists.unread > 0 && (
            <Badge tone="ok" dot>
              {lists.unread} unread
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            square
            aria-label="Refresh watchlists and alerts"
            disabled={lists.isFetching}
            onClick={() => void lists.refetch()}
          >
            <RefreshCw />
          </Button>
        </div>
      </header>

      <p role="status" className="sr-only">
        {lists.unread > 0
          ? `${lists.unread} unread alert${lists.unread === 1 ? "" : "s"}`
          : "No unread alerts"}
      </p>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-line bg-sunken px-3 py-2 text-[11.5px] leading-5 text-fg-2"
        >
          {notice}
        </p>
      )}
      {lists.isError && (
        <p
          role="alert"
          className="rounded-lg border border-line px-3 py-2 text-[11.5px] text-danger-fg"
        >
          {lists.error.message}
        </p>
      )}
      {save.isError && (
        <p
          role="alert"
          className="rounded-lg border border-line px-3 py-2 text-[11.5px] text-danger-fg"
        >
          {save.error.message}
        </p>
      )}
      {remove.isError && (
        <p
          role="alert"
          className="rounded-lg border border-line px-3 py-2 text-[11.5px] text-danger-fg"
        >
          {remove.error.message}
        </p>
      )}
      {read.isError && (
        <p
          role="alert"
          className="rounded-lg border border-line px-3 py-2 text-[11.5px] text-danger-fg"
        >
          {read.error.message}
        </p>
      )}

      <section aria-labelledby={`${ids}-rules`} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3
            id={`${ids}-rules`}
            ref={rulesHeading}
            tabIndex={-1}
            className="text-[12.5px] font-medium text-fg"
          >
            Watches
          </h3>
          {!form && (
            <Button
              size="xs"
              variant="secondary"
              icon={<Plus />}
              disabled={topics.length === 0 && entities.length === 0}
              onClick={beginCreate}
            >
              New watch
            </Button>
          )}
        </div>

        {topics.length === 0 && entities.length === 0 && !form && (
          <p className="rounded-lg border border-line px-3 py-3 text-[11.5px] leading-5 text-fg-3">
            No topic or entity is available in the current window yet. A watch needs a measured
            topic; collect more evidence or widen the window, then add one here.
          </p>
        )}

        {rules.length === 0 && !form ? (
          <p className="rounded-lg border border-line px-3 py-3 text-[11.5px] leading-5 text-fg-3">
            No watch yet. Follow a topic from the board or inspector, or create one here. Nothing
            collected before a watch exists can alert, so the first notification always describes
            genuinely new evidence.
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => {
              const deleting = pendingDelete === rule.id;
              return (
                <li key={rule.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-[12.5px] leading-5 text-fg">
                        {rule.label}
                        <span className="ms-1.5 text-[10.5px] text-fg-3">
                          {rule.kind === "topic" ? "Topic" : "Entity"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-4 text-fg-3">
                        {thresholdSummary(rule)}
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-4 text-fg-3">
                        {rule.enabled
                          ? rule.evaluatedAt
                            ? `Checked ${formatRelative(rule.evaluatedAt)}`
                            : "Waiting for the first check"
                          : "Paused · no new alerts"}
                      </p>
                    </div>
                    {rule.enabled ? (
                      <Badge tone="ok" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge>Paused</Badge>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<Pencil />}
                      disabled={busy}
                      onClick={() => beginEdit(rule)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        save.mutate(
                          { id: rule.id, input: { enabled: !rule.enabled } },
                          {
                            onSuccess: (updated) =>
                              setNotice(
                                updated.enabled
                                  ? `“${updated.label}” is active again. Its baseline restarts now, so records collected while it was paused will not alert.`
                                  : `“${updated.label}” is paused. Existing alerts stay readable.`,
                              ),
                          },
                        )
                      }
                    >
                      {rule.enabled ? "Pause" : "Resume"}
                    </Button>
                    {deleting ? (
                      <span
                        role="group"
                        aria-label={`Confirm deleting ${rule.label}`}
                        className="flex flex-wrap items-center gap-1.5"
                      >
                        <Button
                          size="xs"
                          variant="primary"
                          loading={remove.isPending}
                          onClick={() =>
                            remove.mutate(rule.id, {
                              onSuccess: () => {
                                setPendingDelete(null);
                                setHistoryCursors([]);
                                if (editingId === rule.id) {
                                  setForm(null);
                                  setEditingId(null);
                                }
                                setNotice(`Deleted “${rule.label}” and its alerts.`);
                              },
                            })
                          }
                        >
                          Delete watch and alerts
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setPendingDelete(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<Trash2 />}
                        className="text-danger-fg"
                        disabled={busy}
                        onClick={() => setPendingDelete(rule.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {form && (
        <form
          className="space-y-4 rounded-lg border border-line p-4"
          aria-labelledby={`${ids}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          noValidate
        >
          <h3
            id={`${ids}-form`}
            ref={formHeading}
            tabIndex={-1}
            className="text-[12.5px] font-medium text-fg"
          >
            {editingId ? "Edit watch" : "New watch"}
          </h3>

          <fieldset>
            <legend className="text-[11px] text-fg-3">What to follow</legend>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {(["topic", "entity"] as const).map((kind) => (
                <label key={kind} className="flex items-center gap-1.5 text-[12px] text-fg-2">
                  <input
                    type="radio"
                    name={`${ids}-kind`}
                    value={kind}
                    checked={form.kind === kind}
                    onChange={() => {
                      if (form.kind === kind) return;
                      // Crossing kinds invalidates the target: an entity id is
                      // never a topic id, so the selection resets explicitly.
                      const first: { id: string; label: string } | undefined =
                        kind === "topic" ? topicOptions[0] : entityOptions[0];
                      setForm({
                        ...form,
                        kind,
                        targetId: first?.id ?? "",
                        label: first?.label ?? "",
                      });
                    }}
                  />
                  {kind === "topic" ? "One topic" : "An entity across topics"}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`${ids}-topic-filter`} className="block text-[11px] text-fg-3">
              Filter the list
            </label>
            <input
              id={`${ids}-topic-filter`}
              type="search"
              value={targetQuery}
              onChange={(event) => setTargetQuery(event.target.value)}
              placeholder={form.kind === "topic" ? "Event, product or model" : "Name or alias"}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor={`${ids}-target`} className="block text-[11px] text-fg-3">
              {form.kind === "topic" ? "Topic" : "Entity"}
            </label>
            <select
              id={`${ids}-target`}
              value={form.targetId}
              onChange={(event) => chooseTarget(event.target.value)}
              className={cn(FIELD_CLASS, "xl:text-[12px]")}
            >
              {form.targetId === "" && <option value="">Choose…</option>}
              {form.targetId !== "" &&
                !(form.kind === "topic" ? filteredTopics : filteredEntities).some(
                  (choice) => choice.id === form.targetId,
                ) && (
                  // The target left the current window or the bounded option slice.
                  // Keeping it visible means saving cannot silently repoint the watch.
                  <option value={form.targetId}>{form.label} · not in this window</option>
                )}
              {form.kind === "topic"
                ? filteredTopics.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} · {node.potential}/100
                    </option>
                  ))
                : filteredEntities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.label} · {ENTITY_KIND_LABELS[entity.kind]}
                    </option>
                  ))}
            </select>
            <p className="mt-1 text-[10.5px] leading-4 text-fg-3">
              {form.kind === "topic"
                ? `Showing up to ${TOPIC_OPTION_LIMIT} topics from the current window, highest potential first.`
                : `Showing up to ${ENTITY_OPTION_LIMIT} known entities; an entity watch follows every topic that mentions it.`}
            </p>
          </div>

          <div>
            <label htmlFor={`${ids}-label`} className="block text-[11px] text-fg-3">
              Display name
            </label>
            <input
              id={`${ids}-label`}
              type="text"
              maxLength={300}
              value={form.label}
              onChange={(event) => setForm({ ...form, label: event.target.value })}
              placeholder="How this watch appears in alerts"
              className={FIELD_CLASS}
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-[11px] text-fg-3">When to notify</legend>
            <p className="text-[10.5px] leading-4 text-fg-3">
              At least one growth threshold must be above zero. They are combined with{" "}
              <strong className="font-medium text-fg-2">or</strong>, and the potential floor must
              also be met. Only independent identities first seen after the previous check count.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ThresholdField
                id={`${ids}-accounts`}
                label="New community accounts"
                hint="Distinct posting accounts. Forum times are thread activity, not publication, so a bump on an existing thread never counts."
                value={form.minNewAccounts}
                onChange={(value) => setForm({ ...form, minNewAccounts: value })}
              />
              <ThresholdField
                id={`${ids}-publishers`}
                label="New news publishers"
                hint="Distinct publishers reporting the topic. These records carry a real publication time, so this is the most reliable signal today."
                value={form.minNewPublishers}
                onChange={(value) => setForm({ ...form, minNewPublishers: value })}
              />
              <ThresholdField
                id={`${ids}-sources`}
                label="New sources"
                hint="Distinct collection providers (for example voz or vnexpress) that newly carry the topic."
                value={form.minNewSources}
                onChange={(value) => setForm({ ...form, minNewSources: value })}
              />
              <ThresholdField
                id={`${ids}-potential`}
                label="Minimum potential"
                hint="Required floor: the topic's measured 0–100 heuristic potential must reach it. This is not a probability."
                value={form.minPotential}
                onChange={(value) => setForm({ ...form, minPotential: value })}
              />
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-[12px] text-fg-2">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            />
            Check this watch and record alerts
          </label>

          {formError && (
            <p role="alert" className="text-[11.5px] text-danger-fg">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!editingId && topics.length === 0 && entities.length === 0}
            >
              {editingId ? "Save changes" : "Follow"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(null);
                setEditingId(null);
                setFormError(null);
                // The form unmounts, so focus moves to the section it belonged to
                // instead of falling back to the document.
                rulesHeading.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <section aria-labelledby={`${ids}-alerts`} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3
            id={`${ids}-alerts`}
            ref={alertsHeading}
            tabIndex={-1}
            className="text-[12.5px] font-medium text-fg"
          >
            Notifications
          </h3>
          <span className="text-[10.5px] text-fg-3">
            {lists.unread > 0 ? `${lists.unread} unread in all history` : "All read"} · page{" "}
            {historyCursors.length + 1}
          </span>
        </div>

        {lists.isLoading ? (
          <p
            role="status"
            className="rounded-lg border border-line px-3 py-3 text-[11.5px] text-fg-3"
          >
            Loading watches and alerts…
          </p>
        ) : lists.isError && !lists.data ? (
          <p className="text-[12px] leading-5 text-fg-3">
            Notification history is unavailable. Retry the request above, or return to the latest
            page.
          </p>
        ) : alerts.length === 0 ? (
          <p className="rounded-lg border border-line px-3 py-3 text-[11.5px] leading-5 text-fg-3">
            No notifications on this page. New support accumulates after a watch's baseline or
            previous alert, so a watch can stay quiet across several checks. Current forum feeds
            expose thread activity rather than publication; news publisher and source thresholds are
            the usable publication-backed signals today.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                topic={nodesById.get(alert.topicId) ?? null}
                onOpenTopic={onSelectTopic}
                onMarkRead={(id) => read.mutate(id)}
                busy={read.isPending && read.variables === alert.id}
              />
            ))}
          </ul>
        )}
        <nav aria-label="Notification history pages" className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            disabled={historyCursors.length === 0 || lists.isFetching}
            onClick={() => setHistoryCursors((current) => current.slice(0, -1))}
          >
            Newer notifications
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={!lists.nextCursor || lists.isFetching}
            onClick={() => {
              if (lists.nextCursor) setHistoryCursors((current) => [...current, lists.nextCursor!]);
            }}
          >
            Older notifications
          </Button>
          {historyCursors.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setHistoryCursors([])}>
              Latest notifications
            </Button>
          )}
        </nav>
      </section>

      <section className="space-y-1.5 rounded-lg bg-sunken p-3 text-[10.5px] leading-4 text-fg-3">
        <h3 className="text-[11px] font-medium text-fg-2">How alerts are counted</h3>
        <p>
          A watch stores a baseline when it is created. Only identities whose earliest appearance in
          the topic is newer than the previous check can alert, so imported archives and pre-upgrade
          records never fire. Repeated polls cannot repeat an alert: each alert is keyed by its own
          credited identities.
        </p>
        <p>
          Community-account alerts require source-reported publication times. The current forum
          feeds expose activity only, so they cannot establish new publication or trigger that
          threshold. No alert establishes national popularity or verifies a source's claim.
        </p>
        <p>
          Up to {WATCH_RETENTION.rules} watches are stored. Notifications remain in history; each
          page shows at most {WATCH_RETENTION.alerts}, with older pages available above.
        </p>
      </section>
    </div>
  );
}

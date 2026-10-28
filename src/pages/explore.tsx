import {
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  Minus,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { RANGE_OPTIONS } from "../../shared/config.ts";
import type { RelatedQuery, TermInsight } from "../../shared/types.ts";
import { Sparkline } from "@/components/charts/sparkline";
import { CompareChart } from "@/components/charts/compare-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { CountrySelect, RangeTabs, SourceBadge } from "@/components/controls";
import { EmptyState } from "@/components/empty-state";
import { ForecastPanel } from "@/components/forecast-panel";
import { NoticeBanner } from "@/components/notice-banner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-app";
import { useAnalysis, useSuggestions } from "@/hooks/use-trends";
import { useApp } from "@/lib/app-context";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const SUGGESTED = ["ai", "nvidia", "electric vehicle", "cold plunge"];
const MAX_TERMS = 5;

function parseTerms(value: string | null) {
  const seen = new Set<string>();
  return (value ?? "")
    .split(",")
    .map((term) => term.trim().slice(0, 80))
    .filter((term) => {
      const key = term.toLowerCase();
      if (!term || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TERMS);
}

function RelatedList({ queries, rising }: { queries: RelatedQuery[]; rising: boolean }) {
  const filtered = queries.filter((query) => query.rising === rising).slice(0, 8);
  if (filtered.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No {rising ? "rising" : "top"} queries returned.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {filtered.map((query) => (
        <li key={`${rising}-${query.query}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="break-words">{query.query}</span>
            <span className="numeric shrink-0 text-xs text-muted-foreground">
              {formatNumber(query.value)}
            </span>
          </div>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", rising ? "bg-chart-2" : "bg-chart-1")}
              style={{ width: `${Math.min(100, Math.max(2, query.value))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RegionList({ regions }: { regions: TermInsight["regions"] }) {
  if (regions.length === 0) {
    return <p className="text-xs text-muted-foreground">No regional interest returned.</p>;
  }
  return (
    <ul className="space-y-3">
      {regions.map((region) => (
        <li key={region.code} className="flex items-center gap-3">
          <span className="w-28 shrink-0 break-words text-sm">{region.name}</span>
          <div
            aria-hidden="true"
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.min(100, Math.max(2, region.value))}%` }}
            />
          </div>
          <span className="numeric w-8 shrink-0 text-right text-xs text-muted-foreground">
            {formatNumber(region.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SignalRow({ insight }: { insight: TermInsight }) {
  const Icon =
    insight.forecast.direction === "up"
      ? ArrowUpRight
      : insight.forecast.direction === "down"
        ? ArrowDownRight
        : Minus;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-medium">{insight.term}</p>
        <span className="numeric shrink-0 text-sm font-medium">{formatNumber(insight.latest)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon aria-hidden="true" className="size-3" />
          {formatPercent(insight.changePct)} latest · {insight.forecast.confidence} confidence
        </span>
        <span className="numeric">Forecast {formatPercent(insight.forecast.changePct)}</span>
      </div>
      <Sparkline values={insight.sparkline} className="mt-2 h-5 w-full text-chart-1" />
    </li>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-8">
        <CardHeader>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
      <Card className="xl:col-span-4">
        <CardHeader>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Search and comparison workspace. Terms are staged as chips, then one explicit
 * Analyze action fetches the group: Google normalizes all terms in a request
 * together, so adding each keystroke to the URL would create meaningless series.
 */
export function ExplorePage() {
  const { geo, setGeo, range, setRange, params, replace, openAdd } = useApp();
  const initialTerms = useMemo(() => parseTerms(params.get("terms")), [params]);
  const [draft, setDraft] = useState(initialTerms);
  const [submitted, setSubmitted] = useState(initialTerms);
  const [input, setInput] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const errorId = useId();
  const debouncedInput = useDebouncedValue(input, 280);
  const { data: suggestions = [] } = useSuggestions(debouncedInput);
  const analysis = useAnalysis(submitted, geo, range);

  useEffect(() => {
    const next = parseTerms(params.get("terms"));
    if (next.length > 0 && next.join("|") !== submitted.join("|")) {
      setDraft(next);
      setSubmitted(next);
    }
  }, [params, submitted]);

  const dirty = draft.join("|") !== submitted.join("|");

  function addTerm(value: string) {
    const clean = value.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!clean) {
      setSearchError("Enter a search term to add.");
      inputRef.current?.focus();
      return;
    }
    if (clean.includes(",")) {
      setSearchError("Add one term at a time, without commas.");
      inputRef.current?.focus();
      return;
    }
    if (draft.some((term) => term.toLowerCase() === clean.toLowerCase())) {
      setSearchError(`${clean} is already selected.`);
      inputRef.current?.focus();
      return;
    }
    if (draft.length >= MAX_TERMS) {
      setSearchError("Compare up to five terms at once.");
      inputRef.current?.focus();
      return;
    }
    setDraft([...draft, clean]);
    setInput("");
    setSearchError(null);
    inputRef.current?.focus();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    addTerm(input);
  }

  function removeTerm(term: string) {
    const next = draft.filter((entry) => entry !== term);
    setDraft(next);
    setSearchError(null);
    if (submitted.includes(term)) {
      setSubmitted(next);
      if (next.length > 0) {
        replace("explore", { terms: next.join(",") });
      } else {
        replace("explore");
      }
    }
  }

  function analyze() {
    if (draft.length === 0) return;
    setSubmitted(draft);
    setSearchError(null);
    replace("explore", { terms: draft.join(",") });
  }

  function analyzeOne(term: string) {
    setDraft([term]);
    setSubmitted([term]);
    setSearchError(null);
    replace("explore", { terms: term });
  }

  function retry() {
    if (submitted.length === 0) return;
    void analysis.refetch();
  }

  const single = analysis.data?.insights.length === 1 ? analysis.data.insights[0] : null;
  const related = single?.related ?? [];
  const regions = single?.regions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explore"
        description="Compare search interest across up to five terms and project where each one is heading."
        actions={
          <>
            {analysis.data ? <SourceBadge stale={analysis.data.stale} /> : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => analysis.refetch()}
              disabled={analysis.isFetching || submitted.length === 0}
              aria-label="Refresh analysis"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-3.5", analysis.isFetching && "motion-safe:animate-spin")}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus aria-hidden="true" className="size-3.5" />
              Monitor
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Compare terms</CardTitle>
          <CardDescription>
            Google indexes every term in one request to the same 0–100 scale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor={`${listId}-input`}>Search term</Label>
              <Input
                ref={inputRef}
                id={`${listId}-input`}
                name="term"
                list={listId}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setSearchError(null);
                }}
                placeholder="ai agents"
                autoComplete="off"
                aria-describedby={searchError ? errorId : undefined}
                aria-invalid={searchError ? true : undefined}
              />
              <datalist id={listId}>
                {suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>
            <Button type="submit" variant="outline" className="sm:mb-0.5">
              <Plus aria-hidden="true" className="size-3.5" />
              Add term
            </Button>
          </form>

          {searchError ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {searchError}
            </p>
          ) : null}

          {draft.length > 0 ? (
            <ul aria-label="Selected search terms" className="flex flex-wrap gap-1.5">
              {draft.map((term) => (
                <li key={term}>
                  <span className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-muted/50 py-1 pl-2.5 pr-1 text-xs">
                    <span className="max-w-full break-words">{term}</span>
                    <button
                      type="button"
                      onClick={() => removeTerm(term)}
                      aria-label={`Remove ${term}`}
                      className="grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Start with</span>
              {SUGGESTED.map((term) => (
                <Button
                  key={term}
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setDraft([term]);
                    setSubmitted([term]);
                    replace("explore", { terms: term });
                  }}
                  className="h-6 text-xs text-muted-foreground"
                >
                  {term}
                </Button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <CountrySelect value={geo} onChange={setGeo} />
              <RangeTabs value={range} onChange={setRange} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-xs text-muted-foreground">Up to five terms per comparison.</p>
              <Button size="sm" onClick={analyze} disabled={draft.length === 0 || !dirty}>
                <Search aria-hidden="true" className="size-3.5" />
                Analyze trends
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {analysis.data?.notice ? (
        <NoticeBanner
          message={analysis.data.notice}
          onRetry={retry}
          retrying={analysis.isFetching}
        />
      ) : null}

      {analysis.isLoading && submitted.length > 0 ? <ResultSkeleton /> : null}

      {analysis.isError && !analysis.data ? (
        <Card>
          <EmptyState
            icon={Search}
            title="Unable to analyze these terms"
            description={
              analysis.error instanceof Error
                ? analysis.error.message
                : "The trend service did not respond. Check your connection and try again."
            }
            action={
              <Button variant="outline" size="sm" onClick={retry}>
                Retry
              </Button>
            }
            className="border-0"
          />
        </Card>
      ) : null}

      {submitted.length === 0 && !analysis.isLoading ? (
        <Card>
          {draft.length > 0 ? (
            <EmptyState
              icon={Search}
              title="Ready to analyze"
              description={`Run the comparison for ${draft.join(", ")}.`}
              action={
                <Button size="sm" onClick={analyze}>
                  <Search aria-hidden="true" className="size-3.5" />
                  Analyze trends
                </Button>
              }
              className="border-0 py-12"
            />
          ) : (
            <EmptyState
              icon={Compass}
              title="Explore a search trend"
              description="Add a search term to see its history, related queries, regional interest, and a projection."
              action={
                <Button size="sm" onClick={() => analyzeOne("ai")}>
                  Analyze “ai”
                </Button>
              }
              className="border-0 py-12"
            />
          )}
        </Card>
      ) : null}

      {analysis.data && analysis.data.insights.length > 0 ? (
        <>
          <div className={cn("grid gap-4 xl:grid-cols-12", !single && "items-start")}>
            <Card className="min-w-0 xl:col-span-8">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle>
                      {single ? "Search interest" : "Search interest comparison"}
                    </CardTitle>
                    <CardDescription className="break-words">
                      {analysis.data.query.terms.join(" · ")} · {RANGE_OPTIONS[range].label} ·
                      relative index 0–100
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {single ? (
                  <TrendChart insight={single} range={range} />
                ) : (
                  <CompareChart
                    points={analysis.data.points}
                    terms={analysis.data.query.terms}
                    range={range}
                  />
                )}
              </CardContent>
            </Card>

            {single ? (
              <ForecastPanel insight={single} range={range} className="xl:col-span-4" />
            ) : (
              <Card className="xl:col-span-4">
                <CardHeader>
                  <CardTitle>Signals</CardTitle>
                  <CardDescription>Latest move and projection by term.</CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <ul className="divide-y divide-border">
                    {analysis.data.insights.map((insight) => (
                      <SignalRow key={insight.term} insight={insight} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {single ? (
            related.length > 0 || regions.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-12">
                <Card className="xl:col-span-7">
                  <CardHeader>
                    <CardTitle>Related queries</CardTitle>
                    <CardDescription>
                      What people also searched for around “{single.term}”.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 pt-2 sm:grid-cols-2">
                    <div>
                      <h3 className="mb-3 text-xs font-medium text-foreground">Top</h3>
                      <RelatedList queries={related} rising={false} />
                    </div>
                    <div>
                      <h3 className="mb-3 text-xs font-medium text-foreground">Rising</h3>
                      <RelatedList queries={related} rising />
                    </div>
                  </CardContent>
                </Card>

                <Card className="xl:col-span-5">
                  <CardHeader>
                    <CardTitle>Regional interest</CardTitle>
                    <CardDescription>Where “{single.term}” is searched most.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <RegionList regions={regions} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col gap-2 py-5 text-[0.8125rem] text-muted-foreground">
                  <p>
                    Google Trends did not return related queries or regional interest for this
                    search.
                  </p>
                </CardContent>
              </Card>
            )
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4 text-[0.8125rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>Related queries and regional interest are available for one term at a time.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => analyzeOne(analysis.data.insights[0]!.term)}
                >
                  Analyze one term
                </Button>
              </CardContent>
            </Card>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            Interest is relative to the highest point in the selected range and terms. Forecasts use
            a damped Holt trend with an 80% interval; they are not Google predictions.
          </p>
        </>
      ) : null}
    </div>
  );
}

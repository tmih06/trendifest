import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "sonner";
import type { RangeKey } from "../shared/types.ts";
import { AddTrendDialog } from "@/components/add-trend-dialog";
import { AppShell } from "@/components/app-shell";
import { useHashRoute, useTheme, type RoutePage } from "@/hooks/use-app";
import { useOverview } from "@/hooks/use-trends";
import { AppProvider } from "@/lib/app-context";
import { OverviewPage } from "@/pages/overview";
import { SignalsPage } from "@/pages/signals";
import { ExplorePage } from "@/pages/explore";
import { WatchlistPage } from "@/pages/watchlist";
import { AlertsPage } from "@/pages/alerts";

const TITLES: Record<RoutePage, string> = {
  overview: "Overview",
  signals: "Signals",
  explore: "Explore",
  watchlist: "Watchlist",
  alerts: "Alerts",
};

export default function App() {
  const { page, params, navigate, replace } = useHashRoute();
  const { theme, toggle } = useTheme();
  const [geo, setGeo] = useState("US");
  const [range, setRange] = useState<RangeKey>("12m");
  const [live, setLive] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const addTrigger = useRef<HTMLElement | null>(null);
  const overview = useOverview(geo, range, live);
  const lastPage = useRef<RoutePage | null>(null);

  useEffect(() => {
    document.title = `${TITLES[page]} — Trendifest`;
    // StrictMode replays mount effects. Remember the page instead of a boolean
    // so the initial render never moves focus, and replayed effects are no-ops.
    if (lastPage.current === null || lastPage.current === page) {
      lastPage.current = page;
      return;
    }
    lastPage.current = page;
    window.scrollTo({ top: 0, behavior: "instant" });
    window.requestAnimationFrame(() => document.getElementById("page-title")?.focus());
  }, [page]);

  const openAdd = useCallback(() => {
    // The dialog is controlled from several pages, so capture the actual
    // trigger here; Radix can only restore focus automatically for its own
    // DialogTrigger wrapper.
    addTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAddOpen(true);
  }, []);

  const handleAddOpenChange = useCallback((open: boolean) => {
    setAddOpen(open);
    if (!open) {
      const target = addTrigger.current;
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus();
      });
    }
  }, []);

  const context = useMemo(
    () => ({
      geo,
      setGeo,
      range,
      setRange,
      live,
      setLive,
      overview,
      params,
      navigate,
      replace,
      openAdd,
    }),
    [geo, range, live, overview, params, navigate, replace, openAdd],
  );

  return (
    <AppProvider value={context}>
      <AppShell
        page={page}
        unread={overview.data?.stats.unreadAlerts ?? 0}
        theme={theme}
        onToggleTheme={toggle}
      >
        {page === "overview" ? <OverviewPage /> : null}
        {page === "signals" ? <SignalsPage /> : null}
        {page === "explore" ? <ExplorePage /> : null}
        {page === "watchlist" ? <WatchlistPage /> : null}
        {page === "alerts" ? <AlertsPage /> : null}
      </AppShell>
      <AddTrendDialog open={addOpen} onOpenChange={handleAddOpenChange} defaultGeo={geo} />
      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: "border-border bg-popover font-sans text-popover-foreground",
            description: "text-muted-foreground",
            actionButton: "bg-primary text-primary-foreground",
            cancelButton: "bg-muted text-muted-foreground",
            closeButton: "!size-6 !left-auto !right-0 !translate-x-[35%] !-translate-y-[35%]",
          },
        }}
      />
    </AppProvider>
  );
}

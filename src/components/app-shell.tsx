import {
  Bell,
  ChevronsUpDown,
  Compass,
  Database,
  ExternalLink,
  LayoutDashboard,
  Moon,
  Network,
  Radar,
  Sun,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import type { RoutePage } from "@/hooks/use-app";
import type { Theme } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { page: "overview", label: "Overview", icon: LayoutDashboard },
  { page: "signals", label: "Signals", icon: Waves },
  { page: "explore", label: "Explore", icon: Compass },
  { page: "watchlist", label: "Watchlist", icon: Radar },
  { page: "alerts", label: "Alerts", icon: Bell },
] as const;

const PAGE_LABEL: Record<RoutePage, string> = {
  overview: "Overview",
  signals: "Signals",
  explore: "Explore",
  watchlist: "Watchlist",
  alerts: "Alerts",
};

function LogoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none">
      <path
        d="M4 16.5 9 11l4 3.5 7-7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 7h5v5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="size-7 rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="size-3.5" />
      ) : (
        <Moon aria-hidden="true" className="size-3.5" />
      )}
    </Button>
  );
}

function NavLinks({
  page,
  unread,
  className,
  itemClassName,
}: {
  page: RoutePage;
  unread: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <nav aria-label="Primary" className={className}>
      {NAV.map((item) => {
        const active = item.page === page;
        const Icon = item.icon;
        return (
          <a
            key={item.page}
            href={`#/${item.page}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-6 items-center gap-2 rounded-[3px] px-1.5 text-[12px] transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              itemClassName,
            )}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{item.label}</span>
            {item.page === "alerts" ? (
              <>
                {unread > 0 ? (
                  <span
                    aria-hidden="true"
                    className="numeric ml-auto rounded-[3px] bg-muted px-1 text-[10px] font-medium leading-4 text-muted-foreground"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
                <span className="sr-only">
                  {unread > 0 ? `, ${unread} unread` : ", no unread alerts"}
                </span>
              </>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

interface AppShellProps {
  page: RoutePage;
  unread: number;
  theme: Theme;
  onToggleTheme: () => void;
  children: ReactNode;
}

/**
 * Obsidian-style workspace frame for the classic trend views: title bar,
 * command ribbon, explorer sidebar, scrolling content and a quiet status bar.
 * Below `lg`, the ribbon/sidebar collapse into a scrollable nav row.
 */
export function AppShell({ page, unread, theme, onToggleTheme, children }: AppShellProps) {
  const ActiveIcon = NAV.find((item) => item.page === page)?.icon ?? LayoutDashboard;
  const focusMain = () => {
    // The page heading is the reliable focus target; focusing the <main>
    // landmark itself behaves inconsistently across engines.
    const heading = document.getElementById("page-title");
    heading?.focus();
    heading?.scrollIntoView({ block: "start" });
  };

  return (
    <>
      <a
        href="#main"
        onClick={(event) => {
          // The app uses hash routing, so a plain #main jump would be parsed as
          // a route. Move focus explicitly instead of changing the hash.
          event.preventDefault();
          focusMain();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            focusMain();
          }
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[4px] focus:bg-primary focus:px-3 focus:py-1.5 focus:text-[12px] focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-[38px] shrink-0 items-stretch border-b border-border bg-muted">
          <a
            href="#/overview"
            aria-label="Trendifest overview"
            className="grid w-11 shrink-0 place-items-center border-r border-border text-primary"
          >
            <span className="grid size-5 place-items-center rounded-[3px] bg-primary text-background">
              <LogoGlyph />
            </span>
          </a>

          <div className="hidden w-60 shrink-0 items-center gap-1 border-r border-border px-2.5 text-[12px] lg:flex">
            <span className="truncate font-medium">trendifest</span>
            <ChevronsUpDown className="size-3 text-muted-foreground/70" strokeWidth={1.75} />
          </div>

          <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto px-2">
            <div className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-t-[6px] bg-background px-2.5 text-[12px] text-foreground">
              <ActiveIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              <span className="whitespace-nowrap">{PAGE_LABEL[page]}</span>
            </div>
            <a
              href="#/graph"
              className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-t-[6px] px-2.5 text-[12px] text-muted-foreground/70 hover:bg-accent hover:text-muted-foreground"
            >
              <Network className="size-3.5" strokeWidth={1.75} />
              Related graph
            </a>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1.5">
            <ThemeButton theme={theme} onToggle={onToggleTheme} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Ribbon"
            className="hidden w-11 shrink-0 flex-col items-center border-r border-border bg-muted py-2 lg:flex"
          >
            {NAV.map((item) => {
              const active = item.page === page;
              const Icon = item.icon;
              return (
                <a
                  key={item.page}
                  href={`#/${item.page}`}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "grid size-8 place-items-center rounded-[4px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    active && "bg-accent text-primary",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </a>
              );
            })}
            <a
              href="#/graph"
              aria-label="Related graph"
              title="Related graph"
              className="mt-1 grid size-8 place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Network className="size-[18px]" strokeWidth={1.75} />
            </a>
          </nav>

          <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted lg:flex">
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Explorer
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              <NavLinks page={page} unread={unread} className="flex flex-col gap-0.5" />
            </div>
            <a
              href="https://trends.google.com/trends/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Google Trends
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <div className="flex items-center gap-2 border-t border-border px-2 py-2 text-[11px] text-muted-foreground">
              <Database className="size-3.5 text-muted-foreground/70" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">Local workspace</span>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-border lg:hidden">
              <NavLinks
                page={page}
                unread={unread}
                className="flex gap-0.5 overflow-x-auto px-2 py-1.5"
                itemClassName="shrink-0 gap-1.5 px-2"
              />
            </header>

            <main id="main" className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6">{children}</div>
            </main>
          </div>
        </div>

        <footer className="flex h-[22px] shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-3 text-[11px] text-muted-foreground/70">
          <span>Google Trends workspace</span>
          <span className="tabular-nums">Local</span>
        </footer>
      </div>
    </>
  );
}

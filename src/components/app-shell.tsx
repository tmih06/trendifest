import { Bell, Compass, ExternalLink, LayoutDashboard, Moon, Radar, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { RoutePage } from "@/hooks/use-app";
import type { Theme } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { page: "overview", label: "Overview", icon: LayoutDashboard },
  { page: "explore", label: "Explore", icon: Compass },
  { page: "watchlist", label: "Watchlist", icon: Radar },
  { page: "alerts", label: "Alerts", icon: Bell },
] as const;

function Brand() {
  return (
    <a
      href="#/overview"
      className="flex w-fit items-center gap-2.5 rounded-md px-1 py-1"
      aria-label="Trendifest overview"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4.5" fill="none">
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
      </span>
      <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Trendifest</span>
    </a>
  );
}

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="text-muted-foreground"
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
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
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.8125rem] font-medium transition-colors duration-150",
              active
                ? "bg-secondary font-semibold text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              itemClassName,
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.page === "alerts" ? (
              <>
                {unread > 0 ? (
                  <span
                    aria-hidden="true"
                    className="numeric ml-auto rounded-full bg-foreground px-1.5 py-0.5 text-[0.625rem] font-semibold leading-4 text-background"
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
 * Two-pane application frame. Desktop keeps navigation in a sticky sidebar;
 * small screens get a compact header with the same anchors in one scrollable
 * row, so no destination disappears behind a hamburger.
 */
export function AppShell({ page, unread, theme, onToggleTheme, children }: AppShellProps) {
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-muted/20 px-3 py-4 lg:flex">
          <div className="px-1">
            <Brand />
          </div>

          <NavLinks page={page} unread={unread} className="mt-6 flex flex-col gap-0.5" />

          <div className="mt-auto space-y-3 border-t border-border pt-3">
            <a
              href="https://trends.google.com/trends/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              Data from Google Trends
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-xs text-muted-foreground">Prototype workspace</p>
              <ThemeButton theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-border lg:hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <Brand />
              <ThemeButton theme={theme} onToggle={onToggleTheme} />
            </div>
            <NavLinks
              page={page}
              unread={unread}
              className="flex gap-0.5 overflow-x-auto px-2 pb-2"
              itemClassName="shrink-0 gap-2 px-2 py-1.5"
            />
          </header>

          <main
            id="main"
            className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

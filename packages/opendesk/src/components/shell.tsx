import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/**
 * The app frame, derived from OpenDesk's AppLayout: the header runs across the
 * chrome, the sidebar column sits beside a white work panel inset against the
 * frame, and the whole thing fills the viewport.
 *
 * At <=900px the persistent sidebar is hidden; the app supplies its own mobile
 * sidebar (usually through a Dialog) from `header`.
 */
export function Shell({
  sidebar,
  header,
  children,
  collapsed = false,
  className,
}: {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("od-shell", className)} data-collapsed={collapsed ? "" : undefined}>
      <div className="od-shell-header">{header}</div>
      <div className="od-shell-body">
        <aside className="od-shell-nav">{sidebar}</aside>
        <main className="od-shell-panel">
          <div className="od-shell-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

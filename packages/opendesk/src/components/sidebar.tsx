import { useId, useState, type ReactNode } from "react";
// Icon subpath, not the package root: the root re-exports every icon, which
// would put the whole set in each consumer's dev module graph.
import ChevronDown from "lucide-react/icons/chevron-down";
import { cn } from "../lib/cn.ts";

/**
 * The sidebar column, derived from OpenDesk's Sidebar: one scrollable body
 * and a footer that stays put. It fills whatever height the
 * shell column (or a mobile dialog) gives it.
 */
export function Sidebar({
  children,
  footer,
  collapsed = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Icon rail: the shell column narrows and rows shrink to squares. */
  collapsed?: boolean;
}) {
  return (
    <div className="od-sidebar" data-collapsed={collapsed ? "" : undefined}>
      <div className="od-sidebar-scroll">
        <nav aria-label="Primary" className="flex flex-col">
          {children}
        </nav>
      </div>
      {footer && <div className="od-sidebar-footer">{footer}</div>}
    </div>
  );
}

/** Foldable navigation group; the icon rail always keeps its rows reachable. */
export function SidebarSection({
  label,
  children,
  collapsed = false,
}: {
  label: string;
  children: ReactNode;
  collapsed?: boolean;
}) {
  const [folded, setFolded] = useState(false);
  const contentId = useId();
  const open = collapsed || !folded;
  return (
    <div className="od-sidebar-section">
      {collapsed ? (
        // Keep the header's height in the rail: collapsing must narrow the
        // column, never move the rows above or below it.
        <div aria-hidden="true" className="mb-0.5 h-6" />
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setFolded(!folded)}
          className="mx-2.5 mb-0.5 flex min-h-6 items-center justify-between gap-2 rounded px-2 text-fg-3 hover:text-fg"
        >
          <span className="label-caps truncate">{label}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3 transition-transform motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
          />
        </button>
      )}
      <div id={contentId} className="od-section-content" data-open={open} inert={!open}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-px">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * One compact navigation row: a 15px icon and a 12.5px label on the chrome,
 * 28px tall when expanded and a 32px square in the rail. The current row keeps
 * a grey pill, exactly as upstream.
 */
export function SidebarItem({
  icon,
  children,
  active,
  onClick,
  count,
  collapsed = false,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  /** Filter state: renders a pressed toggle. Omit for plain action rows. */
  active?: boolean;
  onClick: () => void;
  count?: number;
  collapsed?: boolean;
  title?: string;
}) {
  const label = title ?? (typeof children === "string" ? children : undefined);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : title}
      className={cn(
        "group relative isolate flex items-center overflow-hidden rounded-md text-left text-[12.5px] transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none",
        "[&>svg]:size-[15px] [&>svg]:shrink-0 [&>svg]:transition-colors",
        // One geometry in both states: the icon keeps the same inset while the
        // rail clips the label, so collapsing never slides it sideways.
        "mx-2.5 h-7 w-[calc(100%-1.25rem)] gap-2.5 px-2",
        active
          ? "bg-chrome-active font-medium text-fg [&>svg]:text-fg"
          : "text-fg-2 hover:bg-chrome-hover hover:text-fg [&>svg]:text-fg-3 hover:[&>svg]:text-fg-2",
      )}
    >
      {icon}
      <span
        className={
          collapsed ? "w-0 flex-none overflow-hidden opacity-0" : "min-w-0 flex-1 truncate"
        }
      >
        {children}
      </span>
      {!collapsed && count !== undefined && (
        <span
          className={cn(
            "mono ml-auto flex shrink-0 text-[11px] tabular-nums",
            active ? "text-fg-2" : "text-fg-4",
          )}
        >
          {count >= 1000 ? "999+" : count}
        </span>
      )}
    </button>
  );
}

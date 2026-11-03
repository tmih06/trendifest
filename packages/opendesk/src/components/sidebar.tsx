import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/**
 * The sidebar column, derived from OpenDesk's Sidebar: a brand block, one
 * scrollable body and a footer that stays put. It fills whatever height the
 * shell column (or a mobile dialog) gives it.
 */
export function Sidebar({
  brand,
  children,
  footer,
  collapsed = false,
  className,
}: {
  brand: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("od-sidebar", className)} data-collapsed={collapsed ? "" : undefined}>
      <div className="od-sidebar-brand">{brand}</div>
      <div className="od-sidebar-scroll">
        <nav aria-label="Primary" className="flex flex-col">
          {children}
        </nav>
      </div>
      {footer && <div className="od-sidebar-footer">{footer}</div>}
    </div>
  );
}

/** A tracked-uppercase group of navigation rows. The label is hidden in the rail. */
export function SidebarSection({
  label,
  children,
  collapsed = false,
  className,
}: {
  label: string;
  children: ReactNode;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("od-sidebar-section", className)}>
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <div className="mx-2.5 mb-0.5 flex h-6 items-center px-2">
          <span className="label-caps truncate">{label}</span>
        </div>
      )}
      <div className="flex flex-col gap-px">{children}</div>
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
  disabled = false,
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  /** Filter state: renders a pressed toggle. Omit for plain action rows. */
  active?: boolean;
  onClick: () => void;
  count?: number;
  collapsed?: boolean;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  const label = title ?? (typeof children === "string" ? children : undefined);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : title}
      className={cn(
        "group relative isolate flex items-center rounded-md text-left text-[12.5px] transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none",
        "[&>svg]:size-[15px] [&>svg]:shrink-0 [&>svg]:transition-colors",
        collapsed
          ? "mx-auto h-8 w-8 justify-center"
          : "mx-2.5 h-7 w-[calc(100%-1.25rem)] gap-2.5 px-2",
        active
          ? "bg-chrome-active font-medium text-fg [&>svg]:text-fg"
          : "text-fg-2 hover:bg-chrome-hover hover:text-fg [&>svg]:text-fg-3 hover:[&>svg]:text-fg-2",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      {icon}
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{children}</span>
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

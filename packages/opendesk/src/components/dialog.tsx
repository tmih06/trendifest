import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";

// The two panel widths this app opens: a compact sheet (mobile nav, inspector)
// and the default reading width for the explanation and status dialogs.
const WIDTHS = {
  sm: "max-w-[400px]",
  md: "max-w-[520px]",
} as const;

/**
 * A centred modal, derived from OpenDesk's Dialog. Radix supplies the focus
 * trap, Escape handling and ARIA wiring; the page styling is upstream's.
 *
 * The dialog is controlled from outside (`open` + `onOpenChange`), so an
 * external Button is the opener: Radix only restores focus automatically when
 * its own Trigger was used. Here the element focused at the moment of opening
 * is remembered and focused again on close.
 *
 * Kept on its own subpath (`@trendifest/opendesk/dialog`) so the app can load
 * Radix and this panel only when a dialog is first opened.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof WIDTHS;
}) {
  // Radix focuses the content as it opens but only restores focus to its own
  // Trigger, and this dialog is controlled from outside. The opener is
  // the element focused before opening, or — since Safari doesn't focus buttons
  // on click — the last element pressed outside the dialog.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("[data-od-dialog]")) return;
      const focusable = target.closest<HTMLElement>(
        "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (focusable) opener.current = focusable;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[1.5px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out motion-reduce:animate-none" />
        <D.Content
          data-od-dialog=""
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            if (active instanceof HTMLElement && active !== document.body) opener.current = active;
          }}
          onCloseAutoFocus={(event) => {
            const target = opener.current;
            opener.current = null;
            if (target?.isConnected && !target.hasAttribute("disabled")) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-float",
            "od-dialog-panel",
            "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out motion-reduce:animate-none",
            WIDTHS[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-[18px]">
            <div className="min-w-0">
              <D.Title className="text-[15px] font-semibold leading-5 tracking-[-0.015em] text-fg">
                {title}
              </D.Title>
              {description ? (
                <D.Description className="mt-1 text-[12.5px] leading-[18px] text-fg-3">
                  {description}
                </D.Description>
              ) : (
                <D.Description className="sr-only">
                  {typeof title === "string" ? title : "Dialog"}
                </D.Description>
              )}
            </div>
            <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-0.5">
              <D.Close
                aria-label="Close"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-4 transition-colors hover:bg-hover hover:text-fg"
              >
                <X className="size-4" />
              </D.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
              {footer}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

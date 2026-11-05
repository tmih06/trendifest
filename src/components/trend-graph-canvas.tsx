import { GraphCanvas, type GraphConfig, type GraphLink, type GraphNode } from "obi-graph";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "@/hooks/use-app";
import type { TrendNodeData } from "@/lib/graph";

interface TrendGraphCanvasProps {
  theme: Theme;
  nodes: GraphNode<TrendNodeData>[];
  links: GraphLink[];
  selectedId: string | null;
  activeIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
}

/** Color ramp stops at this many measured related-topic links. */
const DEGREE_RAMP = 4;

/**
 * Fit padding is in canvas pixels, so a phone-sized surface would spend most of
 * its width on margin and shrink the topics into an unreadable cluster.
 */
function fitPaddingFor(width: number) {
  if (width < 420) return 24;
  if (width < 760) return 48;
  return 92;
}

/**
 * Bind the collected topic map to obi-graph. The library owns layout, drawing,
 * gestures, zoom and pan; the ranked inspector is the accessible path.
 *
 * Labels fade with zoom instead of remaining visible at distant overview scales.
 * Selected and hovered topics retain the library's contextual labels; the ranked
 * inspector keeps full titles available at every zoom level.
 */
export function TrendGraphCanvas({
  theme,
  nodes,
  links,
  selectedId,
  activeIds,
  onSelect,
}: TrendGraphCanvasProps) {
  const surface = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState({
    neutral: "#737373",
    accent: "#7048e8",
  });
  const [fitPadding, setFitPadding] = useState(92);

  // Canvas accessors need resolved colors, not CSS var() expressions. Read the
  // shell's tokens after each theme change, never during the engine's frame loop.
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setPalette({
      neutral: styles.getPropertyValue("--graph-node").trim(),
      accent: styles.getPropertyValue("--graph-node-focused").trim(),
    });
  }, [theme]);

  // The engine measures its own container; this resizes the margin it fits into.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFitPadding(fitPaddingFor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const config = useMemo<GraphConfig<TrendNodeData>>(
    () => ({
      physics: { charge: -260, linkDistance: 96, warmupTicks: 300 },
      nodes: {
        // Degree owns colour; the API's radius owns size. Keep them independent.
        // Both ends of the ramp clear 3:1 against the canvas surface in either
        // theme, so a topic stays visible whether or not it has related links.
        color: (node) => {
          const weight = Math.min(1, Math.max(0, (node.data?.degree ?? 0) / DEGREE_RAMP));
          return `color-mix(in srgb, ${palette.neutral}, ${palette.accent} ${weight * 100}%)`;
        },
      },
      labels: {
        visible: true,
        alwaysVisible: false,
        hubLabelsAlways: false,
        zoomThreshold: 1.25,
        fadeRange: 0.4,
        fontSize: 11,
        hubFontSize: 12.5,
      },
      camera: { autoFitSelection: true, fitPadding },
    }),
    [palette, fitPadding],
  );

  return (
    <div ref={surface} className="trend-graph-host">
      <GraphCanvas
        className="trend-graph"
        theme={theme}
        nodes={nodes}
        links={links}
        config={config}
        selectedId={selectedId}
        activeIds={activeIds}
        onSelect={onSelect}
      />
    </div>
  );
}

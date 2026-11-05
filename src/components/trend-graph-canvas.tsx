import { GraphCanvas, type GraphConfig, type GraphLink, type GraphNode } from "obi-graph";
import { useEffect, useMemo, useState } from "react";
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

/**
 * Bind the collected map's presentation to obi-graph. The library owns layout,
 * drawing, gestures and controls; the ranked inspector is the accessible path.
 */
export function TrendGraphCanvas({
  theme,
  nodes,
  links,
  selectedId,
  activeIds,
  onSelect,
}: TrendGraphCanvasProps) {
  const [palette, setPalette] = useState({ surface: "#ffffff", accent: "#7048e8", hub: "#737373" });

  // Canvas accessors need resolved colors, not CSS var() expressions. Read the
  // shell's tokens after each theme change, never during the engine's frame loop.
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    setPalette({
      surface: styles.getPropertyValue("--surface").trim(),
      accent: styles.getPropertyValue("--graph-node-focused").trim(),
      hub: styles.getPropertyValue("--graph-node").trim(),
    });
  }, [theme]);

  const config = useMemo<GraphConfig<TrendNodeData>>(
    () => ({
      physics: { charge: -220, linkDistance: 90, warmupTicks: 300 },
      nodes: {
        // Degree owns color; potential owns radius. Keep these independent.
        color: (node) => {
          if (node.hub) return palette.hub;
          const weight = Math.min(1, Math.max(0, ((node.data?.degree ?? 0) - 1) / 4));
          return `color-mix(in srgb, ${palette.surface}, ${palette.accent} ${12 + weight * 88}%)`;
        },
      },
      camera: { autoFitSelection: true },
    }),
    [palette],
  );

  return (
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
  );
}

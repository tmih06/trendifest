import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  KIND_COLOR,
  KIND_LABEL,
  STAGE_COLOR,
  STAGE_LABEL,
  type NodeKind,
  type Stage,
} from "@/pages/trend-graph.data";

/** A small token-colored dot; every caller also prints the kind or stage as text. */
export function Dot({ colorVar, className }: { colorVar: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: `var(${colorVar})` }}
    />
  );
}

export function KindDot({ kind, className }: { kind: NodeKind; className?: string }) {
  return <Dot colorVar={KIND_COLOR[kind]} className={className} />;
}

export function KindLabel({ kind }: { kind: NodeKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      <KindDot kind={kind} />
      {KIND_LABEL[kind]}
    </span>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge variant="outline" className="gap-1.5 bg-background/60">
      <Dot colorVar={STAGE_COLOR[stage]} />
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

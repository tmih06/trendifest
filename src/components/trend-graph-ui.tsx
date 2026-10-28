import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  KIND_COLOR,
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

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge
      variant="outline"
      className="h-5 gap-1 rounded-[3px] border-0 bg-primary/15 px-1.5 text-[10px] font-medium text-primary"
    >
      <Dot colorVar={STAGE_COLOR[stage]} />
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  icon: LucideIcon;
  badge?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, badge, className }: StatCardProps) {
  return (
    <Card className={cn("gap-0 p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">{label}</p>
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-3 flex min-h-8 items-baseline gap-2">
        <p className="numeric text-2xl font-semibold leading-none tracking-[-0.02em] text-foreground">
          {value}
        </p>
        {badge}
      </div>
      <p className="mt-1.5 min-h-4 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

import type { LucideIcon } from "lucide-react";

export interface StatTileProps {
  readonly label: string;
  readonly value: string | number;
  readonly detail?: string;
  readonly icon: LucideIcon;
}

export function StatTile({ label, value, detail, icon: Icon }: StatTileProps): React.JSX.Element {
  return (
    <div className="min-w-0 border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" strokeWidth={1.8} />
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {detail === undefined ? null : (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

import { Clock3, RefreshCw } from "lucide-react";

import { cn } from "../lib/cn.js";
import { Button } from "./button.js";

export interface HistoryListItem {
  readonly id: string;
  readonly label: string;
  readonly timestamp: string;
  readonly detail?: string;
}

export interface HistoryListProps {
  readonly items: readonly HistoryListItem[];
  readonly selectedId?: string | null;
  readonly emptyLabel: string;
  readonly loading?: boolean;
  readonly hasMore?: boolean;
  readonly onSelect?: (id: string) => void;
  readonly onLoadMore?: () => void;
  readonly className?: string;
}

export function HistoryList({
  items,
  selectedId,
  emptyLabel,
  loading = false,
  hasMore = false,
  onSelect,
  onLoadMore,
  className,
}: HistoryListProps): React.JSX.Element {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {items.length === 0 && !loading ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label="历史版本列表">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect?.(item.id)}
                  className={cn(
                    "w-full min-w-0 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary/45 bg-primary/5"
                      : "border-transparent hover:border-border hover:bg-surface-muted",
                  )}
                >
                  <span className="block truncate text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{item.timestamp}</span>
                  </span>
                  {item.detail ? (
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {loading ? (
        <p className="px-3 py-2 text-center text-xs text-muted-foreground">正在加载版本</p>
      ) : null}
      {hasMore ? (
        <div className="border-t border-border p-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={loading}
            onClick={onLoadMore}
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            加载更多版本
          </Button>
        </div>
      ) : null}
    </div>
  );
}

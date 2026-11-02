import type { JournalSummary } from "@dailyflow/application";

import { localDatesEndingAt } from "../date-utils.js";

export interface ActivityHeatmapProps {
  readonly endDate: string;
  readonly summaries: readonly JournalSummary[];
  readonly todayHasJournal?: boolean;
}

export function ActivityHeatmap({
  endDate,
  summaries,
  todayHasJournal = false,
}: ActivityHeatmapProps): React.JSX.Element {
  const dates = localDatesEndingAt(endDate, 84);
  const countsByDate = new Map<string, number>();
  for (const summary of summaries) {
    countsByDate.set(summary.journalDate, (countsByDate.get(summary.journalDate) ?? 0) + 1);
  }
  if (todayHasJournal && !countsByDate.has(endDate)) {
    countsByDate.set(endDate, 1);
  }
  const hasActivity = dates.some((date) => (countsByDate.get(date) ?? 0) > 0);

  return (
    <section aria-labelledby="activity-heatmap-title" className="min-w-0">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">Consistency</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h2 id="activity-heatmap-title" className="text-base font-semibold text-foreground">
          记录热力图
        </h2>
        <span className="text-xs text-muted-foreground">过去 12 周</span>
      </div>
      {hasActivity ? null : (
        <p className="mt-3 text-sm text-muted-foreground">过去 12 周还没有记录</p>
      )}
      <div
        className="mt-4 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1"
        aria-label="过去 12 周日志热力图"
      >
        {dates.map((date) => {
          const count = countsByDate.get(date) ?? 0;
          return (
            <div
              key={date}
              role="status"
              aria-label={`${date} 有 ${count} 篇日志`}
              aria-live="off"
              title={`${date} · ${count} 篇日志`}
              className={[
                "size-3 shrink-0 rounded-[2px] border",
                count === 0
                  ? "border-border bg-surface-muted"
                  : count === 1
                    ? "border-primary/30 bg-primary/30"
                    : count === 2
                      ? "border-primary/45 bg-primary/50"
                      : "border-primary bg-primary/80",
              ].join(" ")}
            />
          );
        })}
      </div>
    </section>
  );
}

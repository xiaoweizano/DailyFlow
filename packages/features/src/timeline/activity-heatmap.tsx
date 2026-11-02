import type { TimelineDaySummary } from "@dailyflow/application";

import { localDatesEndingAt } from "../date-utils.js";

export interface ActivityHeatmapProps {
  readonly endDate: string;
  readonly days: readonly TimelineDaySummary[];
  readonly weeks?: number;
}

function activityClass(journalCount: number): string {
  if (journalCount === 1) {
    return "border-primary/30 bg-primary/25";
  }
  if (journalCount === 2) {
    return "border-primary/45 bg-primary/50";
  }
  if (journalCount >= 3) {
    return "border-primary bg-primary/85";
  }
  return "border-border bg-surface-muted";
}

export function ActivityHeatmap({
  endDate,
  days,
  weeks = 12,
}: ActivityHeatmapProps): React.JSX.Element {
  const entriesByDate = new Map<string, TimelineDaySummary>(
    days.map((entry) => [entry.date, entry]),
  );
  const dates = localDatesEndingAt(endDate, Math.max(1, Math.trunc(weeks)) * 7);

  return (
    <section aria-labelledby="timeline-heatmap-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Rhythm</p>
          <h2 id="timeline-heatmap-title" className="mt-1 text-xl font-semibold text-foreground">
            记录热力图
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>少</span>
          {[0, 1, 2, 3].map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className={`size-3 rounded-[2px] border ${activityClass(level)}`}
            />
          ))}
          <span>多</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        <span>按日志数量着色</span>。<span>每格代表一天</span>，颜色越深表示当天记录越多。
      </p>
      <div
        role="list"
        aria-label={`过去 ${weeks} 周活动热力图`}
        className="mt-5 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2"
      >
        {dates.map((date) => {
          const entry = entriesByDate.get(date);
          const journalCount = entry?.journalCount ?? 0;
          const taskDueCount = entry?.taskDueCount ?? 0;
          return (
            <div
              key={date}
              role="listitem"
              aria-label={`${date}，${journalCount} 篇日志，${taskDueCount} 个任务到期`}
              title={`${date} · ${journalCount} 篇日志 · ${taskDueCount} 个任务到期`}
              className={`size-3.5 shrink-0 rounded-[2px] border ${activityClass(journalCount)}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          有日志
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          有待办到期
        </span>
      </div>
    </section>
  );
}

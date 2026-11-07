import type { TimelineDaySummary } from "@dailyflow/application";

import { localDatesEndingAt } from "../date-utils.js";
import { useAppText } from "../preferences/use-app-text.js";
import { activityLevelClass } from "./activity-level.js";

export interface ActivityHeatmapProps {
  readonly endDate: string;
  readonly days: readonly TimelineDaySummary[];
  readonly weeks?: number;
}

export function ActivityHeatmap({
  endDate,
  days,
  weeks = 12,
}: ActivityHeatmapProps): React.JSX.Element {
  const text = useAppText();
  const entriesByDate = new Map<string, TimelineDaySummary>(
    days.map((entry) => [entry.date, entry]),
  );
  const dates = localDatesEndingAt(endDate, Math.max(1, Math.trunc(weeks)) * 7);

  return (
    <section aria-labelledby="timeline-heatmap-title" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">
            {text("记录节奏", "Rhythm")}
          </p>
          <h2 id="timeline-heatmap-title" className="mt-1 text-xl font-semibold text-foreground">
            {text("记录热力图", "Activity heatmap")}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{text("少", "Less")}</span>
          {[0, 1, 2, 3, 4, 5].map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className={`size-3 rounded-[2px] border ${activityLevelClass(level)}`}
            />
          ))}
          <span>{text("多", "More")}</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        <span>{text("按日志数量着色", "Colored by journal count")}</span>.
        <span>{text("每格代表一天", "Each cell is one day")}</span>
        {text("，颜色越深表示当天记录越多。", ". Darker colors mean more entries that day.")}
      </p>
      <div
        role="list"
        aria-label={text(
          `过去 ${weeks} 周活动热力图`,
          `Activity heatmap for the last ${weeks} weeks`,
        )}
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
              aria-label={text(
                `${date}，${journalCount} 篇日志，${taskDueCount} 个任务到期`,
                `${date}, ${journalCount} journal${journalCount === 1 ? "" : "s"}, ${taskDueCount} task${taskDueCount === 1 ? "" : "s"} due`,
              )}
              title={text(
                `${date} · ${journalCount} 篇日志 · ${taskDueCount} 个任务到期`,
                `${date} · ${journalCount} journal${journalCount === 1 ? "" : "s"} · ${taskDueCount} task${taskDueCount === 1 ? "" : "s"} due`,
              )}
              className={`size-3.5 shrink-0 rounded-[2px] border ${activityLevelClass(journalCount)}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          {text("有日志", "Has journals")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          {text("有待办到期", "Tasks due")}
        </span>
      </div>
    </section>
  );
}

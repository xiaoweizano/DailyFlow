import type { JournalSummary } from "@dailyflow/application";

import { localDatesEndingAt } from "../date-utils.js";
import { getAppMessages, type AppMessages } from "../preferences/app-messages.js";
import { activityLevelClass } from "../timeline/activity-level.js";

const defaultCopy = getAppMessages("zh-CN").dashboard;

export interface ActivityHeatmapProps {
  readonly endDate: string;
  readonly summaries: readonly JournalSummary[];
  readonly todayHasJournal?: boolean;
  readonly copy?: AppMessages["dashboard"];
}

export function ActivityHeatmap({
  endDate,
  summaries,
  todayHasJournal = false,
  copy = defaultCopy,
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
      <p className="font-mono text-[10px] uppercase text-muted-foreground">{copy.heatmapEyebrow}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h2 id="activity-heatmap-title" className="text-base font-semibold text-foreground">
          {copy.heatmapTitle}
        </h2>
        <span className="text-xs text-muted-foreground">{copy.heatmapPeriod}</span>
      </div>
      {hasActivity ? null : (
        <p className="mt-3 text-sm text-muted-foreground">{copy.heatmapEmpty}</p>
      )}
      <div
        className="mt-4 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1"
        aria-label={copy.heatmapLabel}
      >
        {dates.map((date) => {
          const count = countsByDate.get(date) ?? 0;
          return (
            <div
              key={date}
              role="status"
              aria-label={copy.journalCount(date, count)}
              aria-live="off"
              title={copy.journalCountTitle(date, count)}
              className={`size-3 shrink-0 rounded-[2px] border ${activityLevelClass(count)}`}
            />
          );
        })}
      </div>
    </section>
  );
}

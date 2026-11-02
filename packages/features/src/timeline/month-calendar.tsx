import type { TimelineDaySummary } from "@dailyflow/application";

import { formatDate, formatMonth, parseMonth, shiftMonth } from "./calendar-utils.js";

export interface MonthCalendarProps {
  readonly month: string;
  readonly selectedDate?: string;
  readonly days: readonly TimelineDaySummary[];
  readonly onSelectDate: (date: string) => void;
  readonly onMonthChange?: (month: string) => void;
}

const weekDays = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function MonthCalendar({
  month,
  selectedDate,
  days,
  onSelectDate,
  onMonthChange,
}: MonthCalendarProps): React.JSX.Element {
  const parsed = parseMonth(month);
  const entriesByDate = new Map<string, TimelineDaySummary>(
    days.map((entry) => [entry.date, entry]),
  );
  const leadingDays =
    parsed === null
      ? 0
      : (new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).getUTCDay() + 6) % 7;
  const dayCount =
    parsed === null ? 0 : new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 0)).getUTCDate();

  return (
    <section aria-labelledby="month-calendar-title" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Calendar</p>
          <h2 id="month-calendar-title" className="mt-1 text-xl font-semibold text-foreground">
            {formatMonth(month)}
          </h2>
        </div>
        {onMonthChange === undefined ? null : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMonthChange(shiftMonth(month, -1))}
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-2.5 text-xs text-foreground shadow-sm hover:bg-surface-muted"
            >
              上个月
            </button>
            <button
              type="button"
              onClick={() => onMonthChange(shiftMonth(month, 1))}
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-2.5 text-xs text-foreground shadow-sm hover:bg-surface-muted"
            >
              下个月
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-7 border-l border-t border-border bg-surface">
        {weekDays.map((weekDay) => (
          <div
            key={weekDay}
            className="border-b border-r border-border bg-surface-muted px-2 py-2 text-center font-mono text-[10px] text-muted-foreground"
          >
            周{weekDay}
          </div>
        ))}
        {Array.from({ length: leadingDays }, (_, index) => (
          <div
            key={`leading-${index}`}
            aria-hidden="true"
            className="min-h-24 border-b border-r border-border bg-surface-muted/35"
          />
        ))}
        {parsed === null
          ? null
          : Array.from({ length: dayCount }, (_, index) => {
              const day = index + 1;
              const date = formatDate(parsed.year, parsed.monthIndex, day);
              const entry = entriesByDate.get(date);
              const selected = selectedDate === date;
              const activity = [
                entry?.journalCount ? `${entry.journalCount} 篇日志` : null,
                entry?.taskDueCount ? `${entry.taskDueCount} 个任务到期` : null,
              ]
                .filter((value): value is string => value !== null)
                .join("，");

              return (
                <button
                  key={date}
                  type="button"
                  aria-label={`${date}${activity ? `，${activity}` : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelectDate(date)}
                  className={[
                    "group min-h-24 border-b border-r border-border p-2.5 text-left transition-colors",
                    selected
                      ? "bg-primary/8 ring-1 ring-inset ring-primary/45"
                      : "bg-surface hover:bg-surface-muted",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-grid size-7 place-items-center rounded-[4px] font-mono text-xs",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    ].join(" ")}
                  >
                    {String(day).padStart(2, "0")}
                  </span>
                  {entry?.journalCount ? (
                    <span className="mt-2 block truncate text-xs font-medium text-foreground">
                      {entry.title || "无标题日志"}
                    </span>
                  ) : null}
                  {entry?.taskDueCount ? (
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                      {entry.taskDueCount} 个任务
                    </span>
                  ) : null}
                </button>
              );
            })}
      </div>
    </section>
  );
}

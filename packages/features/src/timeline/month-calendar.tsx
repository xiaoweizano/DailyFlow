import type { TimelineDaySummary } from "@dailyflow/application";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useAppMessages } from "../preferences/use-app-messages.js";
import { useAppText } from "../preferences/use-app-text.js";
import { formatDate, formatMonthForLocale, parseMonth, shiftMonth } from "./calendar-utils.js";
import { YearMonthPicker } from "./year-month-picker.js";

export interface MonthCalendarProps {
  readonly month: string;
  readonly selectedDate?: string;
  readonly days: readonly TimelineDaySummary[];
  readonly today?: string;
  readonly onSelectDate: (date: string) => void;
  readonly onMonthChange?: (month: string) => void;
}

const weekDaysZh = ["一", "二", "三", "四", "五", "六", "日"] as const;
const weekDaysEn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function MonthCalendar({
  month,
  selectedDate,
  days,
  today,
  onSelectDate,
  onMonthChange,
}: MonthCalendarProps): React.JSX.Element {
  const text = useAppText();
  const { locale } = useAppMessages();
  const parsed = parseMonth(month);
  const selectedYear = parsed?.year ?? Number(month.slice(0, 4));
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
            {formatMonthForLocale(month, locale)}
          </h2>
        </div>
        {onMonthChange === undefined ? null : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-label={text("上个月", "Previous month")}
              className="inline-flex size-8 items-center justify-center border border-border-strong bg-surface text-foreground shadow-sm hover:bg-surface-muted"
              onClick={() => onMonthChange(shiftMonth(month, -1))}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <YearMonthPicker year={selectedYear} month={month} onSelect={onMonthChange} />
            <button
              type="button"
              aria-label={text("下个月", "Next month")}
              className="inline-flex size-8 items-center justify-center border border-border-strong bg-surface text-foreground shadow-sm hover:bg-surface-muted"
              onClick={() => onMonthChange(shiftMonth(month, 1))}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
            {today === undefined ? null : (
              <button
                type="button"
                onClick={() => onMonthChange(today.slice(0, 7))}
                className="inline-flex h-8 items-center border border-border-strong bg-surface px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-surface-muted"
              >
                {text("回到今天", "Today")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-7 border-l border-t border-border bg-surface">
        {(locale === "en-US" ? weekDaysEn : weekDaysZh).map((weekDay) => (
          <div
            key={weekDay}
            className="border-b border-r border-border bg-surface-muted px-2 py-2 text-center font-mono text-[10px] text-muted-foreground"
          >
            {locale === "en-US" ? weekDay : `周${weekDay}`}
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
                entry?.journalCount
                  ? text(
                      `${entry.journalCount} 篇日志`,
                      `${entry.journalCount} journal${entry.journalCount === 1 ? "" : "s"}`,
                    )
                  : null,
                entry?.taskDueCount
                  ? text(
                      `${entry.taskDueCount} 个任务到期`,
                      `${entry.taskDueCount} task${entry.taskDueCount === 1 ? "" : "s"} due`,
                    )
                  : null,
              ]
                .filter((value): value is string => value !== null)
                .join(locale === "en-US" ? ", " : "，");

              return (
                <button
                  key={date}
                  type="button"
                  aria-label={`${date}${activity ? `${locale === "en-US" ? ", " : "，"}${activity}` : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelectDate(date)}
                  className={[
                    "group min-h-24 border-b border-r border-border p-2.5 text-left transition-colors",
                    entry?.journalCount
                      ? "df-activity-green-1"
                      : selected
                        ? "bg-primary/8 ring-1 ring-inset ring-primary/45"
                        : "bg-surface hover:bg-surface-muted",
                    selected ? "ring-1 ring-inset ring-primary/45" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-grid size-7 place-items-center rounded-[4px] font-mono text-xs",
                      selected
                        ? entry?.journalCount
                          ? "bg-[var(--activity-green-strong)] text-white"
                          : "bg-primary text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    ].join(" ")}
                  >
                    {String(day).padStart(2, "0")}
                  </span>
                  {entry?.journalCount ? (
                    <span className="mt-2 block truncate text-xs font-medium text-foreground">
                      {entry.title || text("无标题日志", "Untitled journal")}
                    </span>
                  ) : null}
                  {entry?.taskDueCount ? (
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                      {text(
                        `${entry.taskDueCount} 个任务`,
                        `${entry.taskDueCount} task${entry.taskDueCount === 1 ? "" : "s"}`,
                      )}
                    </span>
                  ) : null}
                </button>
              );
            })}
      </div>
    </section>
  );
}

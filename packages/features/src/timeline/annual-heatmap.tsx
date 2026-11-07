import type { TimelineDaySummary } from "@dailyflow/application";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useAppMessages } from "../preferences/use-app-messages.js";
import { useAppText } from "../preferences/use-app-text.js";
import {
  buildAnnualHeatmapData,
  keyboardHeatmapDate,
  type AnnualHeatmapCell,
} from "./annual-heatmap-data.js";
import { activityLevelClass } from "./activity-level.js";
import { YearMonthPicker } from "./year-month-picker.js";

const GRID_COLUMNS = "repeat(53, 0.875rem)";
const GRID_ROWS = "repeat(7, 0.875rem)";

export interface AnnualHeatmapProps {
  readonly year: number;
  readonly today?: string;
  readonly days: readonly TimelineDaySummary[];
  readonly weekStartsOn: number;
  readonly timezone?: string;
  readonly onYearChange: (year: number) => void;
  readonly onOpenDate: (date: string) => void;
}

export function AnnualHeatmap({
  year,
  today,
  days,
  weekStartsOn,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  onYearChange,
  onOpenDate,
}: AnnualHeatmapProps): React.JSX.Element {
  const text = useAppText();
  const { locale } = useAppMessages();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        timeZone: "UTC",
      }),
    [locale],
  );
  const data = useMemo(
    () =>
      buildAnnualHeatmapData({
        year,
        timezone,
        weekStartsOn,
        days,
        locale,
        ...(today === undefined ? {} : { today }),
      }),
    [days, locale, timezone, today, weekStartsOn, year],
  );
  const initialDate =
    today !== undefined && data.cells.some((cell) => cell.date === today)
      ? today
      : `${String(year).padStart(4, "0")}-01-01`;
  const [focusedDate, setFocusedDate] = useState(initialDate);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusedDate(initialDate);
  }, [initialDate]);

  const focusedCell =
    data.cells.find((cell) => cell.date === focusedDate) ??
    data.cells.find((cell) => cell.date === initialDate) ??
    data.cells[0];

  function focusDate(date: string): void {
    setFocusedDate(date);
    gridRef.current?.querySelector<HTMLElement>(`[data-heatmap-date="${date}"]`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, cell: AnnualHeatmapCell): void {
    if (event.key === "Enter") {
      if (cell.inYear) {
        onOpenDate(cell.date);
      }
      return;
    }
    const nextDate = keyboardHeatmapDate(cell.date, event.key, weekStartsOn);
    if (nextDate === cell.date) {
      return;
    }
    event.preventDefault();
    const firstDate = data.cells[0]?.date;
    const lastDate = data.cells.at(-1)?.date;
    if (firstDate === undefined || lastDate === undefined) {
      return;
    }
    const boundedDate =
      nextDate < firstDate ? firstDate : nextDate > lastDate ? lastDate : nextDate;
    focusDate(boundedDate);
  }

  const cellRows = Array.from({ length: 7 }, (_, rowIndex) =>
    data.cells.filter((_, cellIndex) => cellIndex % 7 === rowIndex),
  );

  return (
    <section aria-labelledby="annual-heatmap-title" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">
            {text("年度节奏", "Annual rhythm")}
          </p>
          <h2 id="annual-heatmap-title" className="mt-1 text-xl font-semibold text-foreground">
            {text("年度活动", "Annual activity")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {text(
              "每格代表一天，颜色按日志数量分为 0、1、2-3、4-5、6-11、12+ 六级。",
              "Each cell is one day. Color intensity represents 0, 1, 2-3, 4-5, 6-11, or 12+ journals.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={text("上一年", "Previous year")}
            className="inline-flex size-8 items-center justify-center border border-border-strong bg-surface text-foreground hover:border-primary/40"
            onClick={() => onYearChange(year - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <YearMonthPicker
            year={year}
            month={`${String(year).padStart(4, "0")}-01`}
            showMonths={false}
            onSelect={(nextMonth) => onYearChange(Number(nextMonth.slice(0, 4)))}
          />
          <button
            type="button"
            aria-label={text("下一年", "Next year")}
            className="inline-flex size-8 items-center justify-center border border-border-strong bg-surface text-foreground hover:border-primary/40"
            onClick={() => onYearChange(year + 1)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 flex min-w-0 items-start">
        <div aria-hidden="true" className="mr-2 shrink-0 pt-5">
          <div className="grid" style={{ gridTemplateRows: GRID_ROWS, gap: "0.25rem" }}>
            {data.weekdayLabels.map((label) => (
              <span
                key={label.weekday}
                className="flex h-3.5 items-center text-[10px] leading-none text-muted-foreground"
                style={{ gridRow: label.rowIndex + 1 }}
              >
                {label.rowIndex % 2 === 0 ? label.label : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto pb-2">
          <div className="min-w-max">
            <div
              aria-hidden="true"
              className="relative mb-1 h-4"
              style={{ width: "calc(53 * 0.875rem + 52 * 0.25rem)" }}
            >
              {data.monthLabels.map((label) => (
                <span
                  key={label.month}
                  className="absolute top-0 text-[10px] text-muted-foreground"
                  style={{
                    left: `calc(${label.weekIndex} * (0.875rem + 0.25rem))`,
                  }}
                >
                  {label.label}
                </span>
              ))}
            </div>

            <div
              ref={gridRef}
              role="grid"
              aria-label={text(`${year} 年全年日志热力图`, `Journal activity heatmap for ${year}`)}
              className="grid"
              style={{
                gridTemplateRows: GRID_ROWS,
                gap: "0.25rem",
              }}
            >
              {cellRows.map((row, rowIndex) => (
                <div
                  key={row[0]?.date ?? rowIndex}
                  role="row"
                  className="grid"
                  style={{ gridTemplateColumns: GRID_COLUMNS, gap: "0.25rem" }}
                >
                  {row.map((cell) => (
                    <button
                      key={cell.date}
                      type="button"
                      role="gridcell"
                      data-heatmap-date={cell.date}
                      tabIndex={cell.date === focusedCell?.date ? 0 : -1}
                      aria-label={text(
                        `${cell.date}，${cell.journalCount} 篇日志，${cell.taskDueCount} 个任务到期`,
                        `${cell.date}, ${cell.journalCount} journal${cell.journalCount === 1 ? "" : "s"}, ${cell.taskDueCount} task${cell.taskDueCount === 1 ? "" : "s"} due`,
                      )}
                      title={text(
                        `${cell.date} · ${cell.journalCount} 篇日志 · ${cell.taskDueCount} 个任务到期`,
                        `${cell.date} · ${cell.journalCount} journal${cell.journalCount === 1 ? "" : "s"} · ${cell.taskDueCount} task${cell.taskDueCount === 1 ? "" : "s"} due`,
                      )}
                      className={[
                        "relative size-3.5 shrink-0 rounded-[2px] border outline-none",
                        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                        activityLevelClass(cell.journalCount),
                        cell.inYear ? "" : "opacity-40",
                        cell.isToday ? "ring-1 ring-foreground ring-offset-1" : "",
                      ].join(" ")}
                      onClick={() => {
                        if (cell.inYear) {
                          onOpenDate(cell.date);
                        }
                      }}
                      onFocus={() => setFocusedDate(cell.date)}
                      onKeyDown={(event) => handleKeyDown(event, cell)}
                    >
                      {cell.taskDueCount > 0 ? (
                        <span
                          aria-hidden="true"
                          className="df-heatmap-task-corner absolute -right-px -top-px size-0 border-l-[4px] border-t-[4px] border-l-transparent border-t-warning"
                        />
                      ) : null}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <p aria-live="polite" aria-atomic="true">
          {focusedCell === undefined
            ? ""
            : text(
                `${dateFormatter.format(new Date(`${focusedCell.date}T00:00:00.000Z`))}，${focusedCell.journalCount} 篇日志，${focusedCell.taskDueCount} 个任务到期`,
                `${dateFormatter.format(new Date(`${focusedCell.date}T00:00:00.000Z`))}, ${focusedCell.journalCount} journal${focusedCell.journalCount === 1 ? "" : "s"}, ${focusedCell.taskDueCount} task${focusedCell.taskDueCount === 1 ? "" : "s"} due`,
              )}
        </p>
        <div
          role="img"
          aria-label={text(
            "颜色图例：颜色越深表示日志数量越多，从 0 篇到 12 篇以上",
            "Color legend: darker colors represent more journals, from 0 to 12 or more",
          )}
          className="flex items-center gap-1.5"
        >
          <span aria-hidden="true">{text("少", "Less")}</span>
          {[0, 1, 2, 3, 4, 5].map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className={`size-3 rounded-[2px] border ${activityLevelClass(level)}`}
            />
          ))}
          <span aria-hidden="true">{text("多", "More")}</span>
        </div>
      </div>
    </section>
  );
}

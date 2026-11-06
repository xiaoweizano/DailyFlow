import type { TimelineDaySummary } from "@dailyflow/application";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import {
  buildAnnualHeatmapData,
  keyboardHeatmapDate,
  type AnnualHeatmapCell,
} from "./annual-heatmap-data.js";

const GRID_COLUMNS = "repeat(53, 0.875rem)";
const GRID_ROWS = "repeat(7, 0.875rem)";
const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "UTC",
});

function activityClass(journalCount: number): string {
  if (journalCount >= 4) {
    return "border-primary bg-primary/85";
  }
  if (journalCount === 3) {
    return "border-primary/70 bg-primary/65";
  }
  if (journalCount === 2) {
    return "border-primary/50 bg-primary/45";
  }
  if (journalCount === 1) {
    return "border-primary/35 bg-primary/25";
  }
  return "border-border bg-surface-muted";
}

function formatAccessibleDate(value: string): string {
  return DATE_FORMATTER.format(new Date(`${value}T00:00:00.000Z`));
}

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
  const data = useMemo(
    () =>
      buildAnnualHeatmapData({
        year,
        timezone,
        weekStartsOn,
        days,
        ...(today === undefined ? {} : { today }),
      }),
    [days, timezone, today, weekStartsOn, year],
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

  const optionYears = Array.from({ length: 21 }, (_, index) => year - 10 + index);
  const cellRows = Array.from({ length: 7 }, (_, rowIndex) =>
    data.cells.filter((_, cellIndex) => cellIndex % 7 === rowIndex),
  );

  return (
    <section aria-labelledby="annual-heatmap-title" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Annual rhythm</p>
          <h2 id="annual-heatmap-title" className="mt-1 text-xl font-semibold text-foreground">
            年度活动
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            每格代表一天，颜色按日志数量分为 0、1、2、3、4+ 五级。
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="上一年"
            className="inline-flex size-8 items-center justify-center border border-border-strong bg-surface text-foreground hover:border-primary/40"
            onClick={() => onYearChange(year - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <select
            aria-label="选择年份"
            value={year}
            className="h-8 border border-border-strong bg-surface px-2 text-sm font-semibold text-foreground outline-none focus:border-primary"
            onChange={(event) => onYearChange(Number(event.currentTarget.value))}
          >
            {optionYears.map((option) => (
              <option key={option} value={option}>
                {option} 年
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="下一年"
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
              aria-label={`${year} 年全年日志热力图`}
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
                      aria-label={`${cell.date}，${cell.journalCount} 篇日志，${cell.taskDueCount} 个任务到期`}
                      title={`${cell.date} · ${cell.journalCount} 篇日志 · ${cell.taskDueCount} 个任务到期`}
                      className={[
                        "relative size-3.5 shrink-0 rounded-[2px] border outline-none",
                        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                        activityClass(cell.journalCount),
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
            : `${formatAccessibleDate(focusedCell.date)}，${focusedCell.journalCount} 篇日志，${focusedCell.taskDueCount} 个任务到期`}
        </p>
        <div
          role="img"
          aria-label="颜色图例：颜色越深表示日志数量越多，从 0 篇到 4 篇以上"
          className="flex items-center gap-1.5"
        >
          <span aria-hidden="true">少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className={`size-3 rounded-[2px] border ${activityClass(level)}`}
            />
          ))}
          <span aria-hidden="true">多</span>
        </div>
      </div>
    </section>
  );
}

export { buildAnnualHeatmapData, keyboardHeatmapDate } from "./annual-heatmap-data.js";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { useAppText } from "../preferences/use-app-text.js";
import { parseMonth } from "./calendar-utils.js";

export interface YearMonthPickerProps {
  readonly year: number;
  readonly month: string;
  readonly showMonths?: boolean;
  readonly onSelect: (month: string) => void;
}

function parseYear(value: string): number | null {
  if (!/^\d{1,4}$/u.test(value)) {
    return null;
  }
  const year = Number(value);
  return year >= 1 && year <= 9999 ? year : null;
}

function formatMonthValue(year: number, monthIndex: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthLabel(monthIndex: number): string {
  return `${monthIndex + 1} 月`;
}

export function YearMonthPicker({
  year,
  month,
  showMonths = true,
  onSelect,
}: YearMonthPickerProps): React.JSX.Element {
  const text = useAppText();
  const dialogId = useId();
  const parsed = parseMonth(month);
  const selectedMonthIndex = parsed?.monthIndex ?? 0;
  const [open, setOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(String(year));
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const monthButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function openPicker(): void {
    setDraftYear(String(year));
    setError(null);
    setOpen(true);
  }

  function selectMonth(monthIndex: number): void {
    const nextYear = parseYear(draftYear);
    if (nextYear === null) {
      setError(text("请输入 1 到 9999 之间的年份", "Enter a year from 1 to 9999"));
      return;
    }
    onSelect(formatMonthValue(nextYear, monthIndex));
    setOpen(false);
  }

  function selectYear(): void {
    const nextYear = parseYear(draftYear);
    if (nextYear === null) {
      setError(text("请输入 1 到 9999 之间的年份", "Enter a year from 1 to 9999"));
      return;
    }
    onSelect(formatMonthValue(nextYear, selectedMonthIndex));
    setOpen(false);
  }

  function selectRecentYear(offset: number): void {
    onSelect(formatMonthValue(new Date().getFullYear() + offset, selectedMonthIndex));
    setOpen(false);
  }

  function closePicker(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleMonthKeyDown(event: KeyboardEvent<HTMLButtonElement>, monthIndex: number): void {
    const nextMonthIndex = {
      ArrowLeft: Math.max(0, monthIndex - 1),
      ArrowRight: Math.min(11, monthIndex + 1),
      ArrowUp: Math.max(0, monthIndex - 3),
      ArrowDown: Math.min(11, monthIndex + 3),
      Home: 0,
      End: 11,
    }[event.key];
    if (nextMonthIndex === undefined) {
      return;
    }
    event.preventDefault();
    monthButtonRefs.current[nextMonthIndex]?.focus();
  }

  const parsedDraftYear = parseYear(draftYear);
  const errorId = `${dialogId}-year-error`;
  const yearButtonLabel = draftYear.trim() || text("所选年份", "selected year");

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-8 items-center gap-1.5 border border-border-strong bg-surface px-2.5 text-xs font-semibold text-foreground shadow-sm hover:border-primary/50 hover:bg-surface-muted"
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <CalendarDays aria-hidden="true" className="size-3.5 text-primary" />
        {text(`${year} 年`, String(year))}
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </button>

      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label={text("快速选择年月", "Quick date selection")}
          className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-72 border border-border-strong bg-surface p-3 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePicker();
            }
          }}
        >
          <label className="grid gap-1 text-xs font-medium text-foreground">
            {text("年份", "Year")}
            <input
              role="spinbutton"
              aria-label={text("年份", "Year")}
              aria-valuemax={9999}
              aria-valuemin={1}
              aria-valuenow={parsedDraftYear ?? undefined}
              aria-invalid={error !== null}
              aria-describedby={error === null ? undefined : errorId}
              inputMode="numeric"
              value={draftYear}
              className="h-9 border border-border-strong bg-surface px-2 font-mono text-sm text-foreground outline-none focus:border-primary"
              onChange={(event) => {
                setDraftYear(event.currentTarget.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (!showMonths && event.key === "Enter") {
                  event.preventDefault();
                  selectYear();
                }
              }}
            />
          </label>
          {error === null ? null : (
            <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
              {error}
            </p>
          )}

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { label: text("今年", "This year"), offset: 0 },
              { label: text("去年", "Last year"), offset: -1 },
              { label: text("前年", "Two years ago"), offset: -2 },
            ].map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                className="h-8 border border-border bg-surface-muted text-xs font-medium text-foreground hover:border-primary/50 hover:bg-primary/5"
                onClick={() => selectRecentYear(shortcut.offset)}
              >
                {shortcut.label}
              </button>
            ))}
          </div>

          {showMonths ? (
            <div
              role="group"
              aria-label={text("选择月份", "Select month")}
              className="mt-3 grid grid-cols-3 gap-1.5"
            >
              {Array.from({ length: 12 }, (_, monthIndex) => (
                <button
                  ref={(element) => {
                    monthButtonRefs.current[monthIndex] = element;
                  }}
                  key={monthIndex}
                  type="button"
                  aria-label={text(
                    `前往 ${yearButtonLabel} 年 ${monthIndex + 1} 月`,
                    `Go to ${yearButtonLabel}, month ${monthIndex + 1}`,
                  )}
                  aria-pressed={monthIndex === selectedMonthIndex}
                  className="h-9 border border-border bg-surface text-xs text-foreground hover:border-primary/50 hover:bg-primary/5 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
                  onClick={() => selectMonth(monthIndex)}
                  onKeyDown={(event) => handleMonthKeyDown(event, monthIndex)}
                >
                  {monthLabel(monthIndex)}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 h-9 w-full border border-primary bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={selectYear}
            >
              {text(`前往 ${yearButtonLabel} 年`, `Go to ${yearButtonLabel}`)}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

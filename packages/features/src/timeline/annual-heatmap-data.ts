import type { TimelineDaySummary } from "@dailyflow/application";
import type { LocalePreference } from "@dailyflow/application";

const CELL_COUNT = 53 * 7;
const CHINESE_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
const ENGLISH_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ENGLISH_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface AnnualHeatmapInput {
  readonly year: number;
  readonly timezone: string;
  readonly weekStartsOn: number;
  readonly days: readonly TimelineDaySummary[];
  readonly today?: string;
  readonly locale?: LocalePreference;
}

export interface AnnualHeatmapCell {
  readonly date: string;
  readonly inYear: boolean;
  readonly journalCount: number;
  readonly taskDueCount: number;
  readonly isToday: boolean;
}

export interface AnnualHeatmapMonthLabel {
  readonly month: number;
  readonly label: string;
  readonly weekIndex: number;
}

export interface AnnualHeatmapWeekdayLabel {
  readonly weekday: number;
  readonly label: string;
  readonly rowIndex: number;
}

export interface AnnualHeatmapData {
  readonly year: number;
  readonly timezone: string;
  readonly weekStartsOn: number;
  readonly cells: readonly AnnualHeatmapCell[];
  readonly monthLabels: readonly AnnualHeatmapMonthLabel[];
  readonly weekdayLabels: readonly AnnualHeatmapWeekdayLabel[];
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function formatDate(value: Date): string {
  return [
    String(value.getUTCFullYear()).padStart(4, "0"),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDate(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Heatmap year must be an integer between 1 and 9999.");
  }
}

function assertWeekStart(weekStartsOn: number): void {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError("Week start must be an integer between 0 and 6.");
  }
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
  } catch {
    throw new RangeError(`Invalid timezone: ${timezone}`);
  }
}

function weekdayRow(date: string, weekStartsOn: number): number {
  return (parseDate(date).getUTCDay() - weekStartsOn + 7) % 7;
}

export function buildAnnualHeatmapData(input: AnnualHeatmapInput): AnnualHeatmapData {
  assertYear(input.year);
  assertWeekStart(input.weekStartsOn);
  assertTimezone(input.timezone);

  const januaryFirst = `${String(input.year).padStart(4, "0")}-01-01`;
  const startOffset = weekdayRow(januaryFirst, input.weekStartsOn);
  const firstCellDate = shiftDate(januaryFirst, -startOffset);
  const entriesByDate = new Map<string, TimelineDaySummary>(
    input.days.map((entry) => [entry.date, entry]),
  );
  const cells = Array.from({ length: CELL_COUNT }, (_, index) => {
    const date = shiftDate(firstCellDate, index);
    const entry = entriesByDate.get(date);
    return {
      date,
      inYear: date.startsWith(`${String(input.year).padStart(4, "0")}-`),
      journalCount: entry?.journalCount ?? 0,
      taskDueCount: entry?.taskDueCount ?? 0,
      isToday: input.today === date,
    };
  });

  const monthLabels = Array.from({ length: 12 }, (_, monthIndex) => {
    const month = monthIndex + 1;
    const date = `${String(input.year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    const cellIndex = cells.findIndex((cell) => cell.date === date);
    return {
      month,
      label:
        input.locale === "en-US" ? (ENGLISH_MONTHS[monthIndex] ?? String(month)) : `${month} 月`,
      weekIndex: Math.max(0, Math.floor(cellIndex / 7)),
    };
  });

  const weekdayLabels = (input.locale === "en-US" ? ENGLISH_WEEKDAYS : CHINESE_WEEKDAYS)
    .map((label, weekday) => ({
      weekday,
      label,
      rowIndex: (weekday - input.weekStartsOn + 7) % 7,
    }))
    .sort((left, right) => left.rowIndex - right.rowIndex);

  return {
    year: input.year,
    timezone: input.timezone,
    weekStartsOn: input.weekStartsOn,
    cells,
    monthLabels,
    weekdayLabels,
  };
}

function shiftMonthClamped(value: string, months: number): string {
  const date = parseDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return formatDate(date);
}

export function keyboardHeatmapDate(value: string, key: string, weekStartsOn: number): string {
  assertWeekStart(weekStartsOn);
  switch (key) {
    case "ArrowLeft":
      return shiftDate(value, -1);
    case "ArrowRight":
      return shiftDate(value, 1);
    case "ArrowUp":
      return shiftDate(value, -7);
    case "ArrowDown":
      return shiftDate(value, 7);
    case "PageUp":
      return shiftMonthClamped(value, -1);
    case "PageDown":
      return shiftMonthClamped(value, 1);
    case "Home":
      return shiftDate(value, -weekdayRow(value, weekStartsOn));
    case "End":
      return shiftDate(value, 6 - weekdayRow(value, weekStartsOn));
    default:
      return value;
  }
}

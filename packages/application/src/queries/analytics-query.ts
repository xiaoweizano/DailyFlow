import {
  parseLocalDate,
  type EntityId,
  type KnowledgeKind,
  type LocalDate,
  type ReportPeriodType,
  type TaskStatus,
  type UtcTimestamp,
} from "@dailyflow/domain";
import { toLocalDate } from "@dailyflow/shared";

export interface AnalyticsPeriod {
  readonly periodType: ReportPeriodType;
  readonly start: LocalDate;
  readonly end: LocalDate;
  readonly timezone: string;
}

export interface AnalyticsJournalSource {
  readonly id: EntityId;
  readonly journalDate: LocalDate;
  readonly title: string;
  readonly contentPlainText: string;
  readonly tags: readonly string[];
  readonly deletedAt: UtcTimestamp | null;
}

export interface AnalyticsTaskSource {
  readonly id: EntityId;
  readonly status: TaskStatus;
  readonly completedAt: UtcTimestamp | null;
  readonly deletedAt: UtcTimestamp | null;
}

export interface AnalyticsKnowledgeSource {
  readonly id: EntityId;
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly createdAt: UtcTimestamp;
  readonly tags: readonly string[];
  readonly deletedAt: UtcTimestamp | null;
}

export interface AnalyticsSource {
  readonly journals: readonly AnalyticsJournalSource[];
  readonly tasks: readonly AnalyticsTaskSource[];
  readonly knowledge: readonly AnalyticsKnowledgeSource[];
}

export interface AnalyticsTagCount {
  readonly name: string;
  readonly count: number;
}

export interface AnalyticsDailyActivity {
  readonly date: LocalDate;
  readonly journalCount: number;
  readonly characterCount: number;
  readonly tasksCompleted: number;
}

export interface AnalyticsSummary {
  readonly period: AnalyticsPeriod;
  readonly journalDays: number;
  readonly journalCount: number;
  readonly characterCount: number;
  readonly tasksCompleted: number;
  readonly issuesCreated: number;
  readonly solutionsCreated: number;
  readonly knowledgeItems: number;
  readonly activeTags: readonly AnalyticsTagCount[];
  readonly dailyActivity: readonly AnalyticsDailyActivity[];
  readonly missingDataNotes: readonly string[];
}

export interface AnalyticsQuery {
  getSummary(period: AnalyticsPeriod): Promise<AnalyticsSummary>;
}

function utcDate(date: LocalDate): Date {
  const [yearText = "0", monthText = "0", dayText = "1"] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcDate(date: Date): LocalDate {
  return parseLocalDate(date.toISOString().slice(0, 10));
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const shifted = utcDate(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return fromUtcDate(shifted);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }
}

export function resolveAnalyticsPeriod(
  periodType: ReportPeriodType,
  start: string,
  timezone: string,
): AnalyticsPeriod {
  const inputDate = parseLocalDate(start);
  assertTimezone(timezone);

  if (periodType === "week") {
    const mondayOffset = (utcDate(inputDate).getUTCDay() + 6) % 7;
    const periodStart = shiftDate(inputDate, -mondayOffset);
    return {
      periodType,
      start: periodStart,
      end: shiftDate(periodStart, 6),
      timezone,
    };
  }

  if (periodType === "month") {
    const [yearText = "0", monthText = "0"] = inputDate.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    return {
      periodType,
      start: parseLocalDate(`${year}-${String(month).padStart(2, "0")}-01`),
      end: parseLocalDate(
        `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
      ),
      timezone,
    };
  }

  const year = inputDate.slice(0, 4);
  return {
    periodType,
    start: parseLocalDate(`${year}-01-01`),
    end: parseLocalDate(`${year}-12-31`),
    timezone,
  };
}

export function shiftAnalyticsPeriod(period: AnalyticsPeriod, amount: number): AnalyticsPeriod {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("Analytics period offset must be an integer");
  }

  if (period.periodType === "week") {
    return resolveAnalyticsPeriod(
      period.periodType,
      shiftDate(period.start, amount * 7),
      period.timezone,
    );
  }

  const [yearText = "0", monthText = "0"] = period.start.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (period.periodType === "month") {
    const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
    return resolveAnalyticsPeriod(period.periodType, fromUtcDate(shifted), period.timezone);
  }

  return resolveAnalyticsPeriod(
    period.periodType,
    `${String(year + amount).padStart(4, "0")}-01-01`,
    period.timezone,
  );
}

function isWithinPeriod(date: LocalDate, period: AnalyticsPeriod): boolean {
  return date >= period.start && date <= period.end;
}

function addTagCounts(target: Map<string, number>, tags: readonly string[]): void {
  for (const tag of new Set(tags)) {
    if (tag.length > 0) {
      target.set(tag, (target.get(tag) ?? 0) + 1);
    }
  }
}

export function buildAnalyticsSummary(
  source: AnalyticsSource,
  period: AnalyticsPeriod,
): AnalyticsSummary {
  const journals = source.journals.filter(
    (journal) => journal.deletedAt === null && isWithinPeriod(journal.journalDate, period),
  );
  const knowledge = source.knowledge.filter(
    (item) =>
      item.deletedAt === null &&
      isWithinPeriod(toLocalDate(item.createdAt, period.timezone), period),
  );
  const completedTasks = source.tasks.filter((task) => {
    if (task.deletedAt !== null || task.status !== "done" || task.completedAt === null) {
      return false;
    }
    return isWithinPeriod(toLocalDate(task.completedAt, period.timezone), period);
  });

  const daily = new Map<
    LocalDate,
    { journalCount: number; characterCount: number; tasksCompleted: number }
  >();
  for (let date = period.start; date <= period.end; date = shiftDate(date, 1)) {
    daily.set(date, { journalCount: 0, characterCount: 0, tasksCompleted: 0 });
  }
  for (const journal of journals) {
    const day = daily.get(journal.journalDate);
    if (day !== undefined) {
      day.journalCount += 1;
      day.characterCount += Array.from(journal.contentPlainText).length;
    }
  }
  for (const task of completedTasks) {
    const date = toLocalDate(task.completedAt!, period.timezone);
    const day = daily.get(date);
    if (day !== undefined) {
      day.tasksCompleted += 1;
    }
  }

  const tags = new Map<string, number>();
  for (const journal of journals) {
    addTagCounts(tags, journal.tags);
  }
  for (const item of knowledge) {
    addTagCounts(tags, item.tags);
  }

  return {
    period,
    journalDays: new Set(journals.map((journal) => journal.journalDate)).size,
    journalCount: journals.length,
    characterCount: journals.reduce(
      (total, journal) => total + Array.from(journal.contentPlainText).length,
      0,
    ),
    tasksCompleted: completedTasks.length,
    issuesCreated: knowledge.filter((item) => item.kind === "issue").length,
    solutionsCreated: knowledge.filter((item) => item.kind === "solution").length,
    knowledgeItems: knowledge.length,
    activeTags: [...tags.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    dailyActivity: [...daily.entries()].map(([date, activity]) => ({ date, ...activity })),
    missingDataNotes:
      journals.length === 0 && completedTasks.length === 0 && knowledge.length === 0
        ? ["当前周期没有可用记录，统计结果为零。"]
        : [],
  };
}

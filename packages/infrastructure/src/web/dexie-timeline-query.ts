import type {
  AnnualActivityInput,
  Page,
  TimelineCalendarQuery,
  TimelineDaySummary,
  TimelineListQuery,
  TimelineQuery,
} from "@dailyflow/application";
import { annualTimelineDateRange } from "@dailyflow/application";
import type { LocalDate, UtcTimestamp } from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "../memory/pagination-cursor.js";
import type { DailyFlowDb } from "./db.js";
import type { JournalRow, TaskRow } from "./schema.js";

interface TimelineCursor {
  readonly date: string;
}

export interface DexieTimelineQueryOptions {
  readonly database: DailyFlowDb;
}

function maxTimestamp(left: UtcTimestamp | null, right: UtcTimestamp | null): UtcTimestamp | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left >= right ? left : right;
}

function buildSummary(
  date: LocalDate,
  journals: readonly JournalRow[],
  tasks: readonly TaskRow[],
): TimelineDaySummary {
  const journal = journals[0] ?? null;
  const latestTask = tasks.reduce<TaskRow | null>(
    (latest, task) => (latest === null || task.updatedAt > latest.updatedAt ? task : latest),
    null,
  );

  return {
    date,
    journalId: journal?.id ?? null,
    journalCount: journals.length,
    taskDueCount: tasks.length,
    title: journal?.title ?? "任务到期",
    excerpt: journal?.excerpt ?? `${tasks.length} 个任务到期`,
    updatedAt: maxTimestamp(journal?.updatedAt ?? null, latestTask?.updatedAt ?? null),
  };
}

async function loadRange(
  database: DailyFlowDb,
  from: LocalDate,
  to: LocalDate,
): Promise<readonly TimelineDaySummary[]> {
  const [journals, tasks] = await Promise.all([
    database.journals.where("journalDate").between(from, to, true, true).toArray(),
    database.tasks.where("dueDate").between(from, to, true, true).toArray(),
  ]);
  const activeJournals = journals.filter(
    (journal) => journal.deletedAt === null && journal.status === "active",
  );
  const openTasks = tasks.filter(
    (task) => task.deletedAt === null && (task.status === "open" || task.status === "in_progress"),
  );
  const byDate = new Map<
    LocalDate,
    { readonly journals: JournalRow[]; readonly tasks: TaskRow[] }
  >();

  for (const journal of activeJournals) {
    const day = byDate.get(journal.journalDate) ?? { journals: [], tasks: [] };
    day.journals.push(journal);
    byDate.set(journal.journalDate, day);
  }
  for (const task of openTasks) {
    if (task.dueDate === null) {
      continue;
    }
    const day = byDate.get(task.dueDate) ?? { journals: [], tasks: [] };
    day.tasks.push(task);
    byDate.set(task.dueDate, day);
  }

  return [...byDate.entries()]
    .map(([date, day]) => buildSummary(date, day.journals, day.tasks))
    .sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0));
}

export class DexieTimelineQuery implements TimelineQuery {
  private readonly database: DailyFlowDb;

  constructor(options: DexieTimelineQueryOptions) {
    this.database = options.database;
  }

  async getCalendar(query: TimelineCalendarQuery): Promise<readonly TimelineDaySummary[]> {
    return loadRange(this.database, query.from, query.to);
  }

  async getAnnualActivity(input: AnnualActivityInput): Promise<readonly TimelineDaySummary[]> {
    return this.getCalendar(annualTimelineDateRange(input.year));
  }

  async listEntries(query: TimelineListQuery): Promise<Page<TimelineDaySummary>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<TimelineCursor>(query.cursor);
    const entries =
      query.fromDate === undefined || query.toDate === undefined
        ? []
        : (await loadRange(this.database, query.fromDate, query.toDate)).filter(
            (entry) => cursor === null || entry.date < cursor.date,
          );
    const selected = entries.slice(0, limit + 1);
    const items = selected.slice(0, limit);
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        selected.length > limit && last !== undefined ? encodeCursor({ date: last.date }) : null,
    };
  }
}

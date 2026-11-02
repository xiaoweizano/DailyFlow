import type { EntityId, LocalDate, UtcTimestamp } from "@dailyflow/domain";

import type { Page, PageRequest } from "../ports/pagination.js";

export interface TimelineDaySummary {
  readonly date: LocalDate;
  readonly journalId: EntityId | null;
  readonly journalCount: number;
  readonly taskDueCount: number;
  readonly title: string;
  readonly excerpt: string;
  readonly updatedAt: UtcTimestamp | null;
}

export interface TimelineCalendarQuery {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

export interface TimelineListQuery extends PageRequest {
  readonly fromDate?: LocalDate;
  readonly toDate?: LocalDate;
}

export interface TimelineQuery {
  getCalendar(query: TimelineCalendarQuery): Promise<readonly TimelineDaySummary[]>;
  listEntries(query: TimelineListQuery): Promise<Page<TimelineDaySummary>>;
}

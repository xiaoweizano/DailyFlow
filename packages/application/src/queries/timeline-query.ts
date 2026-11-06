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

export interface AnnualActivityInput {
  readonly year: number;
  readonly timezone: string;
}

export interface AnnualActivityQuery {
  getAnnualActivity(input: AnnualActivityInput): Promise<readonly TimelineDaySummary[]>;
}

export interface TimelineQuery extends AnnualActivityQuery {
  getCalendar(query: TimelineCalendarQuery): Promise<readonly TimelineDaySummary[]>;
  listEntries(query: TimelineListQuery): Promise<Page<TimelineDaySummary>>;
}

export function annualTimelineDateRange(year: number): TimelineCalendarQuery {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Timeline year must be an integer between 1 and 9999.");
  }
  const prefix = String(year).padStart(4, "0");
  return {
    from: `${prefix}-01-01` as LocalDate,
    to: `${prefix}-12-31` as LocalDate,
  };
}

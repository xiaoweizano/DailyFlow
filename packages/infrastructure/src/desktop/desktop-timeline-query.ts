import type {
  Page,
  TimelineCalendarQuery,
  TimelineDaySummary,
  TimelineListQuery,
  TimelineQuery,
} from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";
import type {
  TimelineCalendarQueryDto,
  TimelineDaySummaryDto,
  TimelineListQueryDto,
} from "./tauri-contracts.js";

export interface DesktopTimelineQueryOptions {
  readonly client: TauriCommandClient;
}

function toTimelineDaySummary(dto: TimelineDaySummaryDto): TimelineDaySummary {
  return {
    date: dto.date,
    journalId: dto.journalId,
    journalCount: dto.journalCount,
    taskDueCount: dto.taskDueCount,
    title: dto.title,
    excerpt: dto.excerpt,
    updatedAt: dto.updatedAt,
  };
}

function toTimelineListQueryDto(query: TimelineListQuery): TimelineListQueryDto {
  return {
    ...(query.fromDate === undefined ? {} : { fromDate: query.fromDate }),
    ...(query.toDate === undefined ? {} : { toDate: query.toDate }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

export class DesktopTimelineQuery implements TimelineQuery {
  private readonly client: TauriCommandClient;

  constructor(options: DesktopTimelineQueryOptions) {
    this.client = options.client;
  }

  async getCalendar(query: TimelineCalendarQuery): Promise<readonly TimelineDaySummary[]> {
    const calendarQuery: TimelineCalendarQueryDto = {
      from: query.from,
      to: query.to,
    };
    const items = await this.client.getTimelineCalendar(calendarQuery);
    return items.map(toTimelineDaySummary);
  }

  async listEntries(query: TimelineListQuery): Promise<Page<TimelineDaySummary>> {
    const page = await this.client.listTimelineEntries(toTimelineListQueryDto(query));
    return {
      items: page.items.map(toTimelineDaySummary),
      nextCursor: page.nextCursor,
    };
  }
}

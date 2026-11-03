import {
  buildAnalyticsSummary,
  type AnalyticsPeriod,
  type AnalyticsQuery,
  type AnalyticsSummary,
} from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";

export interface DesktopAnalyticsQueryOptions {
  readonly client: TauriCommandClient;
}

export class DesktopAnalyticsQuery implements AnalyticsQuery {
  private readonly client: TauriCommandClient;

  constructor(options: DesktopAnalyticsQueryOptions) {
    this.client = options.client;
  }

  async getSummary(period: AnalyticsPeriod): Promise<AnalyticsSummary> {
    const source = await this.client.getAnalyticsSource({
      start: period.start,
      end: period.end,
      timezone: period.timezone,
    });
    return buildAnalyticsSummary(source, period);
  }
}

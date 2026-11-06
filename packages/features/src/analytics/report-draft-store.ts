import type { AnalyticsPeriod, ReportDraft } from "@dailyflow/application";

export interface ReportDraftStore {
  capture(key: string, draft: ReportDraft): void;
  peek(key: string): ReportDraft | null;
  remove(key: string): void;
}

export function reportPeriodKey(period: AnalyticsPeriod): string {
  return `${period.periodType}:${period.start}:${period.end}:${period.timezone}`;
}

export function createReportDraftStore(): ReportDraftStore {
  const drafts = new Map<string, ReportDraft>();

  return {
    capture(key, draft) {
      drafts.set(key, draft);
    },
    peek(key) {
      return drafts.get(key) ?? null;
    },
    remove(key) {
      drafts.delete(key);
    },
  };
}

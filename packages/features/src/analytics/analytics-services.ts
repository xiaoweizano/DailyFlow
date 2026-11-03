import {
  generateReportDraft,
  saveReportDraft,
  type AnalyticsPeriod,
  type AnalyticsQuery,
  type AnalyticsSummary,
  type ReportDraft,
  type ReportRepository,
} from "@dailyflow/application";
import type {
  Clock,
  ContentDocument,
  IdGenerator,
  JsonObject,
  LocalDate,
  Report,
  ReportPeriodType,
  UtcTimestamp,
} from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";

export interface SaveAnalyticsReportInput {
  readonly periodType: ReportPeriodType;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly content: ContentDocument;
  readonly projectionVersion: number;
  readonly stats: JsonObject;
  readonly sourceWatermark?: UtcTimestamp | null;
  readonly expectedRevision: number | null;
}

export interface AnalyticsRuntimeDependencies {
  readonly analytics: AnalyticsQuery;
  readonly reports: ReportRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface AnalyticsRuntimeServices {
  getSummary(period: AnalyticsPeriod): Promise<AnalyticsSummary>;
  getReport(period: AnalyticsPeriod): Promise<Report | null>;
  generateDraft(summary: AnalyticsSummary): ReportDraft;
  saveReport(input: SaveAnalyticsReportInput): Promise<Result<Report, AppError>>;
}

export interface ReportEditorModel {
  readonly title: string;
  readonly content: ContentDocument;
  readonly projectionVersion: number;
  readonly stats: JsonObject;
  readonly expectedRevision: number | null;
  readonly key: string;
}

export function createAnalyticsRuntimeServices(
  dependencies: AnalyticsRuntimeDependencies,
): AnalyticsRuntimeServices {
  return {
    getSummary: (period) => dependencies.analytics.getSummary(period),
    getReport: (period) =>
      dependencies.reports.getByPeriod({
        periodType: period.periodType,
        periodStart: period.start,
        periodEnd: period.end,
        timezone: period.timezone,
      }),
    generateDraft: generateReportDraft,
    saveReport: (input) =>
      saveReportDraft(
        {
          reports: dependencies.reports,
          ids: dependencies.ids,
          clock: dependencies.clock,
        },
        input,
      ),
  };
}

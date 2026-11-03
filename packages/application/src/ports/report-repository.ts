import type { LocalDate, Report, ReportPeriodType } from "@dailyflow/domain";

export interface ReportPeriodKey {
  readonly periodType: ReportPeriodType;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
  readonly timezone: string;
}

export interface ReportRepository {
  getByPeriod(period: ReportPeriodKey): Promise<Report | null>;
  save(report: Report, expectedRevision: number | null): Promise<Report>;
}

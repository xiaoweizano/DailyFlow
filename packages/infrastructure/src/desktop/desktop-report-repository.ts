import type { ReportPeriodKey, ReportRepository } from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type JsonObject,
  type Report,
} from "@dailyflow/domain";
import { jsonToMarkdown, jsonToPlainText, type TiptapJsonNode } from "@dailyflow/editor";
import { stableStringify } from "@dailyflow/shared";

import type { TauriCommandClient } from "./tauri-client.js";
import type { ReportDto, ReportWriteDto } from "./tauri-contracts.js";

export interface DesktopReportRepositoryOptions {
  readonly client: TauriCommandClient;
  readonly clock: Clock;
}

function toReport(dto: ReportDto): Report {
  return {
    id: dto.id,
    periodType: dto.periodType,
    periodStart: dto.periodStart,
    periodEnd: dto.periodEnd,
    timezone: dto.timezone,
    title: dto.title,
    content: createContentDocument(dto.editorSchemaVersion, dto.contentJson),
    projectionVersion: dto.projectionVersion,
    stats: JSON.parse(dto.statsJson) as JsonObject,
    generatedBy: dto.generatedBy,
    sourceWatermark: dto.sourceWatermark,
    revision: parseRevision(dto.revision),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toReportDto(report: Report, updatedAt: Report["updatedAt"]): ReportWriteDto {
  const document = report.content.doc as TiptapJsonNode;
  return {
    id: report.id,
    periodType: report.periodType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    timezone: report.timezone,
    title: report.title,
    contentJson: report.content.doc,
    editorSchemaVersion: report.content.schemaVersion,
    contentMarkdown: jsonToMarkdown(document),
    contentPlainText: jsonToPlainText(document),
    projectionVersion: report.projectionVersion,
    statsJson: stableStringify(report.stats),
    generatedBy: report.generatedBy,
    sourceWatermark: report.sourceWatermark,
    revision: report.revision,
    createdAt: report.createdAt,
    updatedAt,
    deletedAt: report.deletedAt,
  };
}

export class DesktopReportRepository implements ReportRepository {
  private readonly client: TauriCommandClient;
  private readonly clock: Clock;

  constructor(options: DesktopReportRepositoryOptions) {
    this.client = options.client;
    this.clock = options.clock;
  }

  async getByPeriod(period: ReportPeriodKey): Promise<Report | null> {
    const dto = await this.client.getReportByPeriod({
      periodType: period.periodType,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      timezone: period.timezone,
    });
    return dto === null ? null : toReport(dto);
  }

  async save(report: Report, expectedRevision: number | null): Promise<Report> {
    const updatedAt = parseUtcTimestamp(this.clock.nowUtc());
    const dto = await this.client.saveReport({
      report: toReportDto(report, updatedAt),
      expectedRevision,
    });
    return toReport(dto);
  }
}

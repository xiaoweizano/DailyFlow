import { PortError, type ReportPeriodKey, type ReportRepository } from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type EntityId,
  type JsonObject,
  type Report,
} from "@dailyflow/domain";
import { jsonToMarkdown, jsonToPlainText, type TiptapJsonNode } from "@dailyflow/editor";
import { stableStringify } from "@dailyflow/shared";

import type { DailyFlowDb } from "./db.js";
import type { ReportRow } from "./schema.js";

export interface DexieReportRepositoryOptions {
  readonly database: DailyFlowDb;
  readonly clock: Clock;
}

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    periodType: row.periodType,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    timezone: row.timezone,
    title: row.title,
    content: createContentDocument(
      row.editorSchemaVersion,
      JSON.parse(row.contentJson) as JsonObject,
    ),
    projectionVersion: row.projectionVersion,
    stats: JSON.parse(row.statsJson) as JsonObject,
    generatedBy: row.generatedBy,
    sourceWatermark: row.sourceWatermark,
    revision: parseRevision(row.revision),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toRow(report: Report): ReportRow {
  const document = report.content.doc as TiptapJsonNode;
  return {
    id: report.id,
    periodType: report.periodType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    timezone: report.timezone,
    title: report.title,
    contentJson: stableStringify(report.content.doc),
    editorSchemaVersion: report.content.schemaVersion,
    contentMarkdown: jsonToMarkdown(document),
    contentPlainText: jsonToPlainText(document),
    projectionVersion: report.projectionVersion,
    statsJson: stableStringify(report.stats),
    generatedBy: report.generatedBy,
    sourceWatermark: report.sourceWatermark,
    revision: report.revision,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    deletedAt: report.deletedAt,
  };
}

function conflict(id: EntityId, expectedRevision: number | null, actualRevision?: number): never {
  throw new PortError("CONFLICT", {
    message: "Report revision conflict",
    entity: "report",
    id,
    ...(expectedRevision === null ? {} : { expectedRevision }),
    ...(actualRevision === undefined ? {} : { actualRevision }),
  });
}

function notFound(id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: "Report not found",
    entity: "report",
    id,
  });
}

export class DexieReportRepository implements ReportRepository {
  private readonly database: DailyFlowDb;
  private readonly clock: Clock;

  constructor(options: DexieReportRepositoryOptions) {
    this.database = options.database;
    this.clock = options.clock;
  }

  async getByPeriod(period: ReportPeriodKey): Promise<Report | null> {
    const rows = await this.database.reports
      .where("[periodType+periodStart+periodEnd+timezone]")
      .equals([period.periodType, period.periodStart, period.periodEnd, period.timezone])
      .toArray();
    const active = rows.find((row) => row.deletedAt === null);
    return active === undefined ? null : toReport(active);
  }

  async save(report: Report, expectedRevision: number | null): Promise<Report> {
    return this.database.transaction("rw", this.database.reports, async () => {
      const current = await this.database.reports.get(report.id);
      if (expectedRevision === null) {
        if (current !== undefined && current.deletedAt === null) {
          return conflict(report.id, expectedRevision, current.revision);
        }
      } else if (current === undefined || current.deletedAt !== null) {
        return notFound(report.id);
      } else if (current.revision !== expectedRevision) {
        return conflict(report.id, expectedRevision, current.revision);
      }

      const saved: Report = {
        ...report,
        revision: parseRevision((current?.revision ?? 0) + 1),
        createdAt: current?.createdAt ?? report.createdAt,
        updatedAt: parseUtcTimestamp(this.clock.nowUtc()),
        deletedAt: null,
      };
      await this.database.reports.put(toRow(saved));
      return saved;
    });
  }
}

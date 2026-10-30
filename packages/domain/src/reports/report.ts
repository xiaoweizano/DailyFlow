import type { DomainDependencies } from "../shared/ports.js";
import {
  createContentDocument,
  parsePositiveInteger,
  type ContentDocument,
  type JsonObject,
} from "../shared/content.js";
import { DomainRuleError } from "../shared/errors.js";
import {
  nextEntityId,
  nowUtc,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  requireNonEmptyString,
  type EntityId,
  type LocalDate,
  type Revision,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const REPORT_PERIOD_TYPES = ["week", "month", "year"] as const;
export type ReportPeriodType = (typeof REPORT_PERIOD_TYPES)[number];

export const REPORT_GENERATORS = ["local", "ai_assisted"] as const;
export type ReportGenerator = (typeof REPORT_GENERATORS)[number];

export interface Report {
  readonly id: EntityId;
  readonly periodType: ReportPeriodType;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly content: ContentDocument;
  readonly projectionVersion: number;
  readonly stats: JsonObject;
  readonly generatedBy: ReportGenerator;
  readonly sourceWatermark: UtcTimestamp | null;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface CreateReportInput {
  readonly periodType: ReportPeriodType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly timezone: string;
  readonly title: string;
  readonly content: ContentDocument;
  readonly projectionVersion: number;
  readonly stats: JsonObject;
  readonly generatedBy?: ReportGenerator;
  readonly sourceWatermark?: string | null;
}

export function createReport(input: CreateReportInput, dependencies: DomainDependencies): Report {
  if (!REPORT_PERIOD_TYPES.includes(input.periodType)) {
    throw new DomainRuleError("periodType", `Unsupported report period: ${input.periodType}`);
  }
  if (!REPORT_GENERATORS.includes(input.generatedBy ?? "local")) {
    throw new DomainRuleError("generatedBy", `Unsupported report generator: ${input.generatedBy}`);
  }
  const projectionVersion = parsePositiveInteger(input.projectionVersion, "projectionVersion");

  const periodStart = parseLocalDate(input.periodStart);
  const periodEnd = parseLocalDate(input.periodEnd);
  if (periodStart > periodEnd) {
    throw new DomainRuleError("periodEnd", "Report periodEnd cannot be before periodStart");
  }
  if (typeof input.stats !== "object" || input.stats === null || Array.isArray(input.stats)) {
    throw new DomainRuleError("stats", "Report stats must be a JSON object");
  }
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    periodType: input.periodType,
    periodStart,
    periodEnd,
    timezone: requireNonEmptyString(input.timezone, "timezone"),
    title: input.title,
    content: createContentDocument(input.content.schemaVersion, input.content.doc),
    projectionVersion,
    stats: input.stats,
    generatedBy: input.generatedBy ?? "local",
    sourceWatermark:
      input.sourceWatermark === undefined || input.sourceWatermark === null
        ? null
        : parseUtcTimestamp(input.sourceWatermark),
    revision: parseRevision(0),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

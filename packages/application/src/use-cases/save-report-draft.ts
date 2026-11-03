import {
  createContentDocument,
  createReport,
  nowUtc,
  type Clock,
  type IdGenerator,
  type Report,
} from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { ReportRepository } from "../ports/report-repository.js";
import { JsonObjectSchema, LocalDateSchema, PositiveIntegerSchema } from "../validation.js";

const UtcTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);

export const SaveReportDraftInputSchema = z.object({
  periodType: z.enum(["week", "month", "year"]),
  periodStart: LocalDateSchema,
  periodEnd: LocalDateSchema,
  timezone: z.string().min(1),
  title: z.string().min(1).max(500),
  content: z.object({
    schemaVersion: PositiveIntegerSchema,
    doc: JsonObjectSchema,
  }),
  projectionVersion: PositiveIntegerSchema,
  stats: JsonObjectSchema,
  sourceWatermark: UtcTimestampSchema.nullable().optional(),
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export interface SaveReportDraftDependencies {
  readonly reports: ReportRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export async function saveReportDraft(
  dependencies: SaveReportDraftDependencies,
  rawInput: unknown,
): Promise<Result<Report, AppError>> {
  const parsed = SaveReportDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const input = parsed.data;
  try {
    const existing = await dependencies.reports.getByPeriod({
      periodType: input.periodType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      timezone: input.timezone,
    });
    const content = createContentDocument(input.content.schemaVersion, input.content.doc);

    if (existing === null) {
      const report = createReport(
        {
          periodType: input.periodType,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          timezone: input.timezone,
          title: input.title,
          content,
          projectionVersion: input.projectionVersion,
          stats: input.stats,
          generatedBy: "local",
          sourceWatermark: input.sourceWatermark ?? null,
        },
        dependencies,
      );
      return ok(await dependencies.reports.save(report, null));
    }

    const updated: Report = {
      ...existing,
      title: input.title,
      content,
      projectionVersion: input.projectionVersion,
      stats: input.stats,
      updatedAt: nowUtc(dependencies.clock),
    };
    return ok(await dependencies.reports.save(updated, input.expectedRevision));
  } catch (error) {
    return err(mapApplicationError(error, "report"));
  }
}

import { parseUtcTimestamp, type Clock, type UtcTimestamp } from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { ContentProjector } from "../ports/journal-repository.js";
import {
  EXPORT_SCOPES,
  type ExportArchiveOptions,
  type ExportDataOutcome,
  type ExportOptions,
  type ExportSource,
  type ExportTarget,
} from "../ports/export-target.js";

const UtcTimestampSchema = z.string().transform<UtcTimestamp>((value, context) => {
  try {
    return parseUtcTimestamp(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Must be a canonical UTC ISO 8601 timestamp.",
    });
    return z.NEVER;
  }
});

export const ExportDataInputSchema = z.object({
  scope: z.enum(EXPORT_SCOPES).default("all"),
  includeDeleted: z.boolean().default(false),
  includeAttachments: z.boolean().default(true),
  includeImportRawBytes: z.boolean().default(true),
  generatedAt: UtcTimestampSchema.optional(),
});

export interface ExportDataDependencies {
  readonly source: ExportSource;
  readonly target: ExportTarget;
  readonly projector: ContentProjector;
  readonly clock: Clock;
}

export async function exportData(
  dependencies: ExportDataDependencies,
  rawInput: unknown,
): Promise<Result<ExportDataOutcome, AppError>> {
  const parsed = ExportDataInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const input = parsed.data;
  const options: ExportOptions = {
    scope: input.scope,
    includeDeleted: input.includeDeleted,
    includeAttachments: input.includeAttachments,
    includeImportRawBytes: input.includeImportRawBytes,
  };

  try {
    const generatedAt = input.generatedAt ?? parseUtcTimestamp(dependencies.clock.nowUtc());
    const archiveOptions: ExportArchiveOptions = {
      ...options,
      generatedAt,
    };

    await dependencies.source.estimate(options);
    const artifact = await dependencies.source.createArchive(
      archiveOptions,
      dependencies.projector,
    );
    const saved = await dependencies.target.save(artifact);
    if (saved === null) {
      return ok({ status: "cancelled" });
    }
    return ok({
      status: "saved",
      artifact,
      saved,
    });
  } catch (error) {
    return err(mapApplicationError(error, "export"));
  }
}

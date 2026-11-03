import { parseUtcTimestamp, type Clock, type UtcTimestamp } from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type {
  BackupArtifact,
  BackupSaveResult,
  BackupService,
  BackupTarget,
} from "../ports/backup-service.js";

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

export const CreateBackupInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200).optional(),
    createdAt: UtcTimestampSchema.optional(),
  })
  .strict();

export interface CreateBackupDependencies {
  readonly service: BackupService;
  readonly target: BackupTarget;
  readonly clock: Clock;
}

export type CreateBackupOutcome =
  | {
      readonly status: "saved";
      readonly artifact: BackupArtifact;
      readonly saved: BackupSaveResult;
    }
  | { readonly status: "cancelled" };

function defaultFileName(createdAt: UtcTimestamp): string {
  return `dailyflow-backup-${createdAt.slice(0, 10)}.dailyflow-backup.zip`;
}

export async function createBackup(
  dependencies: CreateBackupDependencies,
  rawInput: unknown,
): Promise<Result<CreateBackupOutcome, AppError>> {
  const parsed = CreateBackupInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  try {
    const createdAt = parsed.data.createdAt ?? parseUtcTimestamp(dependencies.clock.nowUtc());
    const artifact = await dependencies.service.create({
      fileName: parsed.data.fileName ?? defaultFileName(createdAt),
      createdAt,
    });
    const saved = await dependencies.target.save(artifact);
    if (saved === null) {
      return ok({ status: "cancelled" });
    }
    return ok({ status: "saved", artifact, saved });
  } catch (error) {
    return err(mapApplicationError(error, "backup"));
  }
}

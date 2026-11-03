import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type {
  BackupRestoreOptions,
  BackupRestoreResult,
  BackupService,
} from "../ports/backup-service.js";

export const RestoreBackupInputSchema = z
  .object({
    bytes: z.instanceof(Uint8Array),
    expectedContentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    replaceExisting: z.literal(true),
  })
  .strict();

export interface RestoreBackupDependencies {
  readonly service: BackupService;
}

export async function restoreBackup(
  dependencies: RestoreBackupDependencies,
  rawInput: unknown,
): Promise<Result<BackupRestoreResult, AppError>> {
  const parsed = RestoreBackupInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const options: BackupRestoreOptions = {
    expectedContentDigest: parsed.data.expectedContentDigest,
    replaceExisting: true,
  };

  try {
    return ok(await dependencies.service.restore(parsed.data.bytes, options));
  } catch (error) {
    return err(mapApplicationError(error, "backup"));
  }
}

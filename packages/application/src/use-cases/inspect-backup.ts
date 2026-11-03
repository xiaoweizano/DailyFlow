import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { BackupService, InspectedBackup } from "../ports/backup-service.js";

export const InspectBackupInputSchema = z
  .object({
    bytes: z.instanceof(Uint8Array),
  })
  .strict();

export interface InspectBackupDependencies {
  readonly service: BackupService;
}

export async function inspectBackup(
  dependencies: InspectBackupDependencies,
  rawInput: unknown,
): Promise<Result<InspectedBackup, AppError>> {
  const parsed = InspectBackupInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  try {
    return ok(await dependencies.service.inspect(parsed.data.bytes));
  } catch (error) {
    return err(mapApplicationError(error, "backup"));
  }
}

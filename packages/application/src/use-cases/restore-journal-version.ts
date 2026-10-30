import { nowUtc, type Clock } from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { JournalRepository, SavedJournalSnapshot } from "../ports/journal-repository.js";
import { EntityIdSchema, PositiveIntegerSchema } from "../validation.js";

export const RestoreJournalVersionInputSchema = z.object({
  journalId: EntityIdSchema,
  versionRevision: PositiveIntegerSchema,
  expectedCurrentRevision: PositiveIntegerSchema,
});

export interface RestoreJournalVersionDependencies {
  readonly journals: JournalRepository;
  readonly clock: Clock;
}

export async function restoreJournalVersion(
  dependencies: RestoreJournalVersionDependencies,
  rawInput: unknown,
): Promise<Result<SavedJournalSnapshot, AppError>> {
  const parsed = RestoreJournalVersionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const input = parsed.data;
  try {
    const version = await dependencies.journals.getVersion(input.journalId, input.versionRevision);
    if (version === null) {
      return err({
        code: "NOT_FOUND",
        entity: "journal_version",
        id: `${input.journalId}:${input.versionRevision}`,
      });
    }

    const snapshot = await dependencies.journals.restoreVersion({
      journalId: input.journalId,
      versionRevision: input.versionRevision,
      expectedCurrentRevision: input.expectedCurrentRevision,
      restoredAt: nowUtc(dependencies.clock),
    });
    return ok(snapshot);
  } catch (error) {
    return err(mapApplicationError(error, "journal"));
  }
}

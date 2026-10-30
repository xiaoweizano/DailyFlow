import { createJournal, type Clock, type IdGenerator, type Journal } from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { JournalRepository } from "../ports/journal-repository.js";
import { LocalDateSchema } from "../validation.js";

export const GetJournalInputSchema = z.object({
  journalDate: LocalDateSchema,
  timezone: z.string().trim().min(1).max(100),
});

export interface GetJournalDependencies {
  readonly journals: JournalRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface JournalLookup {
  readonly journal: Journal;
  readonly isPersisted: boolean;
}

export async function getJournal(
  dependencies: GetJournalDependencies,
  rawInput: unknown,
): Promise<Result<JournalLookup, AppError>> {
  const parsed = GetJournalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  try {
    const persisted = await dependencies.journals.getByDate(parsed.data.journalDate);
    if (persisted !== null) {
      return ok({ journal: persisted, isPersisted: true });
    }

    const draft = createJournal(
      {
        journalDate: parsed.data.journalDate,
        timezone: parsed.data.timezone,
        content: {
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [],
          },
        },
        projectionVersion: 1,
      },
      {
        ids: dependencies.ids,
        clock: dependencies.clock,
      },
    );

    return ok({ journal: draft, isPersisted: false });
  } catch (error) {
    return err(mapApplicationError(error, "journal"));
  }
}

import {
  createKnowledgeItem,
  nowUtc,
  parseContentHash,
  type Clock,
  type IdGenerator,
  type KnowledgeItem,
} from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { ContentProjector, JournalRepository } from "../ports/journal-repository.js";
import type { KnowledgeRepository } from "../ports/knowledge-repository.js";
import { EntityIdSchema } from "../validation.js";

export const PromoteToKnowledgeInputSchema = z.object({
  journalId: EntityIdSchema,
  sourceBlockId: EntityIdSchema.nullable().optional(),
  kind: z.enum(["note", "issue", "solution", "decision", "reference"]),
  title: z.string().max(200).optional(),
  summary: z.string().max(1000).optional(),
});

export interface PromoteToKnowledgeDependencies {
  readonly journals: JournalRepository;
  readonly knowledge: KnowledgeRepository;
  readonly projector: ContentProjector;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export async function promoteToKnowledge(
  dependencies: PromoteToKnowledgeDependencies,
  rawInput: unknown,
): Promise<Result<KnowledgeItem, AppError>> {
  const parsed = PromoteToKnowledgeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const input = parsed.data;
  try {
    const journal = await dependencies.journals.getById(input.journalId);
    if (journal === null) {
      return err({
        code: "NOT_FOUND",
        entity: "journal",
        id: input.journalId,
      });
    }

    const projected = await dependencies.projector.project({
      content: journal.content,
      tags: [],
    });
    const item = createKnowledgeItem(
      {
        kind: input.kind,
        title: input.title ?? journal.title,
        content: journal.content,
        projectionVersion: journal.projectionVersion,
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        sourceJournalId: journal.id,
        sourceBlockId: input.sourceBlockId ?? null,
      },
      {
        ids: dependencies.ids,
        clock: dependencies.clock,
      },
    );
    const withHash: KnowledgeItem = {
      ...item,
      contentHash: parseContentHash(projected.contentHash),
      updatedAt: nowUtc(dependencies.clock),
    };

    return ok(await dependencies.knowledge.save(withHash, null));
  } catch (error) {
    return err(mapApplicationError(error, "knowledge_item"));
  }
}

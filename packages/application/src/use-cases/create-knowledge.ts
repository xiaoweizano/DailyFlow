import {
  createKnowledgeItem,
  parseContentHash,
  type Clock,
  type IdGenerator,
  type KnowledgeItem,
} from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { ContentProjector } from "../ports/journal-repository.js";
import type { KnowledgeRepository } from "../ports/knowledge-repository.js";
import { JsonObjectSchema, PositiveIntegerSchema } from "../validation.js";

const KNOWLEDGE_PROJECTION_VERSION = 1;

export const CreateKnowledgeInputSchema = z.object({
  kind: z.enum(["note", "issue", "solution", "decision", "reference"]),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).optional(),
  contentSchemaVersion: PositiveIntegerSchema,
  contentJson: JsonObjectSchema,
});

export interface CreateKnowledgeDependencies {
  readonly knowledge: KnowledgeRepository;
  readonly projector: ContentProjector;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export async function createKnowledge(
  dependencies: CreateKnowledgeDependencies,
  rawInput: unknown,
): Promise<Result<KnowledgeItem, AppError>> {
  const parsed = CreateKnowledgeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const input = parsed.data;
  try {
    const item = createKnowledgeItem(
      {
        kind: input.kind,
        title: input.title,
        content: {
          schemaVersion: input.contentSchemaVersion,
          doc: input.contentJson,
        },
        projectionVersion: KNOWLEDGE_PROJECTION_VERSION,
      },
      {
        ids: dependencies.ids,
        clock: dependencies.clock,
      },
    );
    const projected = await dependencies.projector.project({
      content: item.content,
      tags: [],
    });
    const withProjection: KnowledgeItem = {
      ...item,
      contentHash: parseContentHash(projected.contentHash),
      summary:
        input.summary === undefined || input.summary === "" ? projected.excerpt : input.summary,
    };

    return ok(await dependencies.knowledge.save(withProjection, null));
  } catch (error) {
    return err(mapApplicationError(error, "knowledge_item"));
  }
}

import {
  createKnowledgeItem,
  isJsonObject,
  nowUtc,
  parseContentHash,
  type Clock,
  type ContentDocument,
  type IdGenerator,
  type JsonObject,
  type JsonValue,
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

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]),
    );
  }
  return value;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function cloneContentDocument(content: ContentDocument): ContentDocument {
  return {
    schemaVersion: content.schemaVersion,
    doc: cloneJsonObject(content.doc),
  };
}

function findStructuredBlock(node: JsonObject, blockId: string): JsonObject | null {
  if (node.type === "structuredBlock" && isJsonObject(node.attrs) && node.attrs.id === blockId) {
    return cloneJsonObject(node);
  }

  for (const child of Array.isArray(node.content) ? node.content : []) {
    if (isJsonObject(child)) {
      const match = findStructuredBlock(child, blockId);
      if (match !== null) {
        return match;
      }
    }
  }
  return null;
}

function blockSnapshot(content: ContentDocument, blockId: string): ContentDocument | null {
  const block = findStructuredBlock(content.doc, blockId);
  if (block === null) {
    return null;
  }

  return {
    schemaVersion: content.schemaVersion,
    doc: {
      type: "doc",
      content: [block],
    },
  };
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

    const sourceBlockId = input.sourceBlockId ?? null;
    const snapshot =
      sourceBlockId === null
        ? cloneContentDocument(journal.content)
        : blockSnapshot(journal.content, sourceBlockId);
    if (snapshot === null) {
      return err({
        code: "NOT_FOUND",
        entity: "structured_block",
        id: sourceBlockId ?? "",
      });
    }

    const projected = await dependencies.projector.project({
      content: snapshot,
      tags: [],
    });
    const item = createKnowledgeItem(
      {
        kind: input.kind,
        title: input.title ?? journal.title,
        content: snapshot,
        projectionVersion: journal.projectionVersion,
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        sourceJournalId: journal.id,
        sourceBlockId,
      },
      {
        ids: dependencies.ids,
        clock: dependencies.clock,
      },
    );
    const withHash: KnowledgeItem = {
      ...item,
      contentMarkdown: projected.contentMarkdown,
      contentPlainText: projected.contentPlainText,
      contentHash: parseContentHash(projected.contentHash),
      updatedAt: nowUtc(dependencies.clock),
    };

    return ok(await dependencies.knowledge.save(withHash, null));
  } catch (error) {
    return err(mapApplicationError(error, "knowledge_item"));
  }
}

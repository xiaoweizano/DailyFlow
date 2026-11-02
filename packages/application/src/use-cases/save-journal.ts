import { createContentDocument, createTagName, nowUtc, type Clock } from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type {
  ContentProjector,
  JournalRepository,
  SavedJournalSnapshot,
  SaveJournalSnapshot,
} from "../ports/journal-repository.js";
import {
  EntityIdSchema,
  JsonObjectSchema,
  LocalDateSchema,
  PositiveIntegerSchema,
} from "../validation.js";

export const SaveJournalInputSchema = z.object({
  journalId: EntityIdSchema,
  journalDate: LocalDateSchema,
  timezone: z.string().trim().min(1).max(100),
  title: z.string().max(200),
  contentJson: JsonObjectSchema,
  editorSchemaVersion: PositiveIntegerSchema,
  projectionVersion: PositiveIntegerSchema,
  expectedRevision: PositiveIntegerSchema.nullable(),
  checkpoint: z.enum(["autosave", "explicit", "restore", "import"]),
  tags: z.array(z.string().trim().min(1).max(64)).max(50),
});

export interface SaveJournalDependencies {
  readonly journals: JournalRepository;
  readonly projector: ContentProjector;
  readonly clock: Clock;
}

function projectTags(tags: readonly string[]): {
  readonly projectorTags: readonly string[];
  readonly normalizedTags: readonly string[];
} {
  const projectorTags: string[] = [];
  const normalizedTags: string[] = [];
  const seenDisplayValues = new Set<string>();
  const seenNormalizedValues = new Set<string>();

  for (const rawTag of tags) {
    const tagName = createTagName(rawTag);
    const displayValue = rawTag.trim();
    if (!seenDisplayValues.has(displayValue)) {
      seenDisplayValues.add(displayValue);
      projectorTags.push(displayValue);
    }
    if (!seenNormalizedValues.has(tagName.normalized)) {
      seenNormalizedValues.add(tagName.normalized);
      normalizedTags.push(tagName.normalized);
    }
  }

  return {
    projectorTags,
    normalizedTags,
  };
}

function tagsMatch(currentTags: readonly string[], normalizedTags: readonly string[]): boolean {
  const current = [...new Set(currentTags.map((tag) => createTagName(tag).normalized))].sort();
  const next = [...normalizedTags].sort();
  return current.length === next.length && current.every((tag, index) => tag === next[index]);
}

export async function saveJournal(
  dependencies: SaveJournalDependencies,
  rawInput: unknown,
): Promise<Result<SavedJournalSnapshot, AppError>> {
  const parsed = SaveJournalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const input = parsed.data;
  try {
    const currentState =
      input.expectedRevision === null
        ? null
        : await dependencies.journals.getSaveState(input.journalId);

    if (input.expectedRevision !== null) {
      if (currentState === null) {
        return err({
          code: "NOT_FOUND",
          entity: "journal",
          id: input.journalId,
        });
      }
      if (currentState.revision !== input.expectedRevision) {
        return err({
          code: "CONFLICT",
          entity: "journal",
          expectedRevision: input.expectedRevision,
          actualRevision: currentState.revision,
        });
      }
    }

    const content = createContentDocument(input.editorSchemaVersion, input.contentJson);
    const tags = projectTags(input.tags);
    const savedAt = nowUtc(dependencies.clock);
    const projected = await dependencies.projector.project({
      content,
      tags: tags.projectorTags,
      searchContext: {
        ownerEntityId: input.journalId,
        entityType: "journal",
        title: input.title,
        localDate: input.journalDate,
        updatedAt: savedAt,
      },
    });

    if (
      currentState !== null &&
      currentState.journalDate === input.journalDate &&
      currentState.timezone === input.timezone &&
      currentState.contentHash === projected.contentHash &&
      currentState.title === input.title &&
      currentState.projectionVersion === input.projectionVersion &&
      tagsMatch(currentState.tags, tags.normalizedTags)
    ) {
      return ok({
        journalId: currentState.journalId,
        revision: currentState.revision,
        savedAt: currentState.updatedAt,
        contentHash: currentState.contentHash,
        versionCreated: false,
        searchIndexState: "ready",
      });
    }

    const snapshot: SaveJournalSnapshot = {
      journalId: input.journalId,
      journalDate: input.journalDate,
      timezone: input.timezone,
      title: input.title,
      contentJson: input.contentJson,
      editorSchemaVersion: input.editorSchemaVersion,
      contentMarkdown: projected.contentMarkdown,
      contentPlainText: projected.contentPlainText,
      contentHash: projected.contentHash,
      projectionVersion: input.projectionVersion,
      excerpt: projected.excerpt,
      expectedRevision: input.expectedRevision,
      checkpoint: input.checkpoint,
      tags: tags.normalizedTags,
      structuredBlocks: projected.structuredBlocks,
      searchDocuments: projected.searchDocuments,
      savedAt,
    };

    return ok(await dependencies.journals.saveSnapshot(snapshot));
  } catch (error) {
    return err(mapApplicationError(error, "journal"));
  }
}

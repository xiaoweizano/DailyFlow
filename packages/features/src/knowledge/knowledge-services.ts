import {
  createKnowledge,
  promoteToKnowledge,
  type ContentProjector,
  type JournalRepository,
  type KnowledgeListQuery,
  type KnowledgeRepository,
  type KnowledgeSummary,
  type Page,
} from "@dailyflow/application";
import type { Clock, EntityId, IdGenerator, KnowledgeItem, LocalDate } from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";

export interface KnowledgeDetail {
  readonly item: KnowledgeItem;
  readonly sourceJournalDate: LocalDate | null;
  readonly sourceJournalAvailable: boolean;
}

export interface KnowledgeRuntimeServices {
  readonly list: (query?: KnowledgeListQuery) => Promise<Page<KnowledgeSummary>>;
  readonly get: (id: EntityId) => Promise<KnowledgeDetail | null>;
  readonly create: (input: unknown) => Promise<Result<KnowledgeItem, AppError>>;
  readonly promote: (input: unknown) => Promise<Result<KnowledgeItem, AppError>>;
}

export interface KnowledgeRuntimeDependencies {
  readonly journals: JournalRepository;
  readonly knowledge: KnowledgeRepository;
  readonly projector: ContentProjector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { readonly code?: unknown }).code === "string"
  );
}

export function knowledgeErrorMessage(error: unknown, fallback: string): string {
  if (isAppError(error)) {
    switch (error.code) {
      case "VALIDATION_ERROR":
        return Object.values(error.fields ?? {})[0] ?? fallback;
      case "STORAGE_UNAVAILABLE":
        return error.cause?.trim() || fallback;
      case "AI_UNAVAILABLE":
        return error.reason.trim() || fallback;
      default:
        return fallback;
    }
  }

  return error instanceof Error && error.message.trim() !== "" ? error.message : fallback;
}

export function createKnowledgeRuntimeServices(
  dependencies: KnowledgeRuntimeDependencies,
): KnowledgeRuntimeServices {
  return {
    list: (query = {}) => dependencies.knowledge.list(query),
    get: async (id) => {
      const item = await dependencies.knowledge.getById(id);
      if (item === null) {
        return null;
      }

      const sourceJournal =
        item.sourceJournalId === null
          ? null
          : await dependencies.journals.getById(item.sourceJournalId);

      return {
        item,
        sourceJournalDate: sourceJournal?.journalDate ?? null,
        sourceJournalAvailable: sourceJournal !== null,
      };
    },
    create: (input) =>
      createKnowledge(
        {
          knowledge: dependencies.knowledge,
          projector: dependencies.projector,
          ids: dependencies.ids,
          clock: dependencies.clock,
        },
        input,
      ),
    promote: (input) =>
      promoteToKnowledge(
        {
          journals: dependencies.journals,
          knowledge: dependencies.knowledge,
          projector: dependencies.projector,
          ids: dependencies.ids,
          clock: dependencies.clock,
        },
        input,
      ),
  };
}

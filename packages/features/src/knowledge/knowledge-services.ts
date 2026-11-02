import {
  promoteToKnowledge,
  type ContentProjector,
  type JournalRepository,
  type KnowledgeListQuery,
  type KnowledgeRepository,
  type KnowledgeSummary,
  type Page,
} from "@dailyflow/application";
import type {
  Clock,
  EntityId,
  IdGenerator,
  KnowledgeItem,
  LocalDate,
} from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";

export interface KnowledgeDetail {
  readonly item: KnowledgeItem;
  readonly sourceJournalDate: LocalDate | null;
}

export interface KnowledgeRuntimeServices {
  readonly list: (query?: KnowledgeListQuery) => Promise<Page<KnowledgeSummary>>;
  readonly get: (id: EntityId) => Promise<KnowledgeDetail | null>;
  readonly promote: (input: unknown) => Promise<Result<KnowledgeItem, AppError>>;
}

export interface KnowledgeRuntimeDependencies {
  readonly journals: JournalRepository;
  readonly knowledge: KnowledgeRepository;
  readonly projector: ContentProjector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
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
      };
    },
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

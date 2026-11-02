import {
  getJournal,
  restoreJournalVersion,
  saveJournal,
  type ContentProjector,
  type JournalRepository,
  type JournalVersionSummary,
  type JournalLookup,
  type Page,
  type PageRequest,
  type SavedJournalSnapshot,
} from "@dailyflow/application";
import type { Clock, EntityId, IdGenerator, JournalVersion } from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";

export interface JournalRuntimeDependencies {
  readonly journals: JournalRepository;
  readonly projector: ContentProjector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface JournalRuntimeServices {
  readonly get: (input: unknown) => Promise<Result<JournalLookup, AppError>>;
  readonly save: (input: unknown) => Promise<Result<SavedJournalSnapshot, AppError>>;
  readonly listVersions: (
    journalId: EntityId,
    page: PageRequest,
  ) => Promise<Page<JournalVersionSummary>>;
  readonly getVersion: (journalId: EntityId, revision: number) => Promise<JournalVersion | null>;
  readonly restore: (input: unknown) => Promise<Result<SavedJournalSnapshot, AppError>>;
}

export function createJournalRuntimeServices(
  dependencies: JournalRuntimeDependencies,
): JournalRuntimeServices {
  return {
    get: (input) =>
      getJournal(
        {
          journals: dependencies.journals,
          ids: dependencies.ids,
          clock: dependencies.clock,
        },
        input,
      ),
    save: (input) =>
      saveJournal(
        {
          journals: dependencies.journals,
          projector: dependencies.projector,
          clock: dependencies.clock,
        },
        input,
      ),
    listVersions: (journalId, page) => dependencies.journals.listVersions(journalId, page),
    getVersion: (journalId, revision) => dependencies.journals.getVersion(journalId, revision),
    restore: (input) =>
      restoreJournalVersion(
        {
          journals: dependencies.journals,
          clock: dependencies.clock,
        },
        input,
      ),
  };
}

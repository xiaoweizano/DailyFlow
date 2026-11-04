import type { Clock, IdGenerator } from "@dailyflow/domain";
import type { Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import type { KnowledgeItem, Report, Task } from "@dailyflow/domain";

import type { AttachmentStore } from "../ports/attachment-store.js";
import type { BackupService } from "../ports/backup-service.js";
import type { ImportService } from "../ports/import-service.js";
import type {
  ContentProjector,
  JournalRepository,
  SavedJournalSnapshot,
} from "../ports/journal-repository.js";
import type { KnowledgeRepository } from "../ports/knowledge-repository.js";
import type { ReportRepository } from "../ports/report-repository.js";
import type { SearchPort } from "../ports/search-port.js";
import type { TaskRepository } from "../ports/task-repository.js";
import type { AnalyticsQuery } from "../queries/analytics-query.js";
import { completeTask } from "../use-cases/complete-task.js";
import { createTask } from "../use-cases/create-task.js";
import { getJournal, type JournalLookup } from "../use-cases/get-journal.js";
import { promoteToKnowledge } from "../use-cases/promote-to-knowledge.js";
import { reopenTask } from "../use-cases/reopen-task.js";
import { restoreJournalVersion } from "../use-cases/restore-journal-version.js";
import { saveJournal } from "../use-cases/save-journal.js";
import { saveReportDraft } from "../use-cases/save-report-draft.js";
import { updateTask } from "../use-cases/update-task.js";

export interface ApplicationDependencies {
  readonly journals: JournalRepository;
  readonly knowledge: KnowledgeRepository;
  readonly tasks: TaskRepository;
  readonly search: SearchPort;
  readonly attachments: AttachmentStore;
  readonly imports: ImportService;
  readonly backups: BackupService;
  readonly analytics: AnalyticsQuery;
  readonly reports: ReportRepository;
  readonly projector: ContentProjector;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface ApplicationUseCases {
  readonly getJournal: (input: unknown) => Promise<Result<JournalLookup, AppError>>;
  readonly saveJournal: (input: unknown) => Promise<Result<SavedJournalSnapshot, AppError>>;
  readonly restoreJournalVersion: (
    input: unknown,
  ) => Promise<Result<SavedJournalSnapshot, AppError>>;
  readonly promoteToKnowledge: (input: unknown) => Promise<Result<KnowledgeItem, AppError>>;
  readonly createTask: (input: unknown) => Promise<Result<Task, AppError>>;
  readonly completeTask: (input: unknown) => Promise<Result<Task, AppError>>;
  readonly reopenTask: (input: unknown) => Promise<Result<Task, AppError>>;
  readonly updateTask: (input: unknown) => Promise<Result<Task, AppError>>;
  readonly saveReportDraft: (input: unknown) => Promise<Result<Report, AppError>>;
}

export interface AppServices extends ApplicationDependencies {
  readonly useCases: ApplicationUseCases;
}

export function createAppServices(dependencies: ApplicationDependencies): AppServices {
  return {
    ...dependencies,
    useCases: {
      getJournal: (input) =>
        getJournal(
          {
            journals: dependencies.journals,
            ids: dependencies.ids,
            clock: dependencies.clock,
          },
          input,
        ),
      saveJournal: (input) =>
        saveJournal(
          {
            journals: dependencies.journals,
            projector: dependencies.projector,
            clock: dependencies.clock,
          },
          input,
        ),
      restoreJournalVersion: (input) =>
        restoreJournalVersion(
          {
            journals: dependencies.journals,
            clock: dependencies.clock,
          },
          input,
        ),
      promoteToKnowledge: (input) =>
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
      createTask: (input) =>
        createTask(
          {
            tasks: dependencies.tasks,
            clock: dependencies.clock,
            ids: dependencies.ids,
          },
          input,
        ),
      completeTask: (input) =>
        completeTask(
          {
            tasks: dependencies.tasks,
            clock: dependencies.clock,
          },
          input,
        ),
      reopenTask: (input) =>
        reopenTask(
          {
            tasks: dependencies.tasks,
            clock: dependencies.clock,
          },
          input,
        ),
      updateTask: (input) =>
        updateTask(
          {
            tasks: dependencies.tasks,
            clock: dependencies.clock,
          },
          input,
        ),
      saveReportDraft: (input) =>
        saveReportDraft(
          {
            reports: dependencies.reports,
            ids: dependencies.ids,
            clock: dependencies.clock,
          },
          input,
        ),
    },
  };
}

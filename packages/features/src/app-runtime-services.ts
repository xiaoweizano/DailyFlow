import {
  checkDataHealth,
  loadUserPreferences,
  prepareAiAssist,
  rebuildSearchIndex,
  runAiAssist,
  saveUserPreferences,
  TxtImportService,
  type AiProviderRegistry,
  type AppServices,
  type DataManagementPort,
  type ExportSource,
  type ExportTarget,
  type ImportRepository,
  type ImportSource,
  type ImportTxtAnalyzer,
  type SecretStore,
  type SettingsStore,
  type TimelineQuery,
  type TxtDocumentConverter,
  type UserPreferences,
} from "@dailyflow/application";
import type { Clock, IdGenerator, LocalDate } from "@dailyflow/domain";
import { createUuidV7 } from "@dailyflow/shared";

import type {
  AppRuntimeServices,
  StorageLocationRuntimeServices,
} from "./app-services-context.js";
import { createAnalyticsRuntimeServices } from "./analytics/analytics-services.js";
import { createAttachmentRuntimeServices } from "./attachments/attachment-services.js";
import { EditorContentProjector } from "./journal/content-projector.js";
import { createJournalRuntimeServices } from "./journal/journal-services.js";
import { createKnowledgeRuntimeServices } from "./knowledge/knowledge-services.js";
import { createSaveLifecycle, type SaveLifecycle } from "./lifecycle/save-lifecycle.js";
import { createTaskRuntimeServices } from "./tasks/task-services.js";
import {
  createBackupRuntimeServices,
  type BackupRuntimeServices,
  type BackupStorageServices,
} from "./data-management/backup-services.js";
import {
  createExportRuntimeServices,
  type ExportRuntimeServices,
} from "./data-management/export-services.js";

export interface CreateAppRuntimeServicesOptions extends Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search" | "analytics" | "reports"
> {
  readonly backupStorage: BackupStorageServices;
  readonly importStorage: ImportStorageServices;
  readonly exportStorage: ExportStorageServices;
  readonly timeline: TimelineQuery;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly lifecycle?: SaveLifecycle;
  readonly today?: () => LocalDate;
  readonly timezone?: () => string;
  readonly dataManagement: DataManagementPort;
  readonly settingsStore: SettingsStore;
  readonly aiProviderRegistry: AiProviderRegistry;
  readonly secretStore: SecretStore;
  readonly storageLocation?: StorageLocationRuntimeServices;
  readonly applyRuntimePreferences?: (preferences: UserPreferences) => Promise<void>;
}

export interface ImportStorageServices {
  readonly source: ImportSource;
  readonly repository: ImportRepository;
  readonly analyzer: ImportTxtAnalyzer;
  readonly converter: TxtDocumentConverter;
}

export interface ExportStorageServices {
  readonly source: ExportSource;
  readonly target: ExportTarget;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

const systemIds: IdGenerator = {
  nextId: createUuidV7,
};

function systemLocalDate(): LocalDate {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as LocalDate;
}

function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function createAppRuntimeServices(
  options: CreateAppRuntimeServicesOptions,
): AppRuntimeServices {
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? systemIds;
  const projector = new EditorContentProjector();

  return {
    analytics: createAnalyticsRuntimeServices({
      analytics: options.analytics,
      reports: options.reports,
      clock,
      ids,
    }),
    backups: createBackupRuntimeServices({
      ...options.backupStorage,
      clock,
    }),
    attachments: createAttachmentRuntimeServices({
      attachments: options.attachments,
    }),
    exports: createExportRuntimeServices({
      source: options.exportStorage.source,
      target: options.exportStorage.target,
      projector,
      clock,
    }),
    imports: new TxtImportService({
      source: options.importStorage.source,
      repository: options.importStorage.repository,
      analyzer: options.importStorage.analyzer,
      converter: options.importStorage.converter,
      projector,
      clock,
      ids,
      timezone: options.timezone ?? systemTimezone,
    }),
    journal: createJournalRuntimeServices({
      journals: options.journals,
      projector,
      clock,
      ids,
    }),
    knowledge: createKnowledgeRuntimeServices({
      journals: options.journals,
      knowledge: options.knowledge,
      projector,
      clock,
      ids,
    }),
    search: options.search,
    lifecycle: options.lifecycle ?? createSaveLifecycle(),
    tasks: createTaskRuntimeServices({
      tasks: options.tasks,
      clock,
      ids,
      today: options.today ?? systemLocalDate,
    }),
    timeline: options.timeline,
    settings: {
      load: () => loadUserPreferences({ store: options.settingsStore }),
      save: (input) => saveUserPreferences({ store: options.settingsStore }, input),
      ...(options.applyRuntimePreferences === undefined
        ? {}
        : { applyRuntimePreferences: options.applyRuntimePreferences }),
    },
    ai: {
      providers: options.aiProviderRegistry.list(),
      secretBackend: options.secretStore.backend,
      prepare: (input) => prepareAiAssist({ registry: options.aiProviderRegistry }, input),
      run: (preview, runOptions) =>
        runAiAssist({ registry: options.aiProviderRegistry }, preview, runOptions),
    },
    dataManagement: {
      inspect: () => checkDataHealth({ port: options.dataManagement, clock }),
      rebuildSearchIndex: (rebuildOptions) =>
        rebuildSearchIndex({
          search: options.search,
          ...rebuildOptions,
        }),
    },
    ...(options.storageLocation === undefined
      ? {}
      : { storageLocation: options.storageLocation }),
  };
}

export type { DataManagementRuntimeServices } from "./app-services-context.js";
export type { BackupRuntimeServices, ExportRuntimeServices };

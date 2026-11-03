import type {
  AiAssistOutcome,
  AiAssistPreview,
  AiProviderDescriptor,
  DataHealthReport,
  ImportService,
  RunAiAssistOptions,
  SearchPort,
  SearchRebuildOptions,
  SearchRebuildResult,
  SecretStoreBackend,
  UserPreferencesLoadResult,
  UserPreferencesSaveResult,
  TimelineQuery,
} from "@dailyflow/application";
import type { AppError, Result } from "@dailyflow/shared";
import { createContext } from "react";

import type { AnalyticsRuntimeServices } from "./analytics/analytics-services.js";
import type { AttachmentRuntimeServices } from "./attachments/attachment-services.js";
import type { JournalRuntimeServices } from "./journal/journal-services.js";
import type { KnowledgeRuntimeServices } from "./knowledge/knowledge-services.js";
import type { SaveLifecycle } from "./lifecycle/save-lifecycle.js";
import type { TaskRuntimeServices } from "./tasks/task-services.js";
import type { BackupRuntimeServices } from "./data-management/backup-services.js";
import type { ExportRuntimeServices } from "./data-management/export-services.js";

export interface AppRuntimeServices {
  readonly analytics: AnalyticsRuntimeServices;
  readonly backups: BackupRuntimeServices;
  readonly exports: ExportRuntimeServices;
  readonly imports: ImportService;
  readonly journal: JournalRuntimeServices;
  readonly knowledge: KnowledgeRuntimeServices;
  readonly attachments: AttachmentRuntimeServices;
  readonly search: SearchPort;
  readonly lifecycle: SaveLifecycle;
  readonly tasks: TaskRuntimeServices;
  readonly timeline: TimelineQuery;
  readonly settings: SettingsRuntimeServices;
  readonly ai: AiRuntimeServices;
  readonly dataManagement?: DataManagementRuntimeServices;
}

export interface SettingsRuntimeServices {
  load(): Promise<UserPreferencesLoadResult>;
  save(input: unknown): Promise<UserPreferencesSaveResult>;
}

export interface AiRuntimeServices {
  readonly providers: readonly AiProviderDescriptor[];
  readonly secretBackend: SecretStoreBackend;
  prepare(input: unknown): Promise<Result<AiAssistPreview, AppError>>;
  run(
    preview: AiAssistPreview,
    options?: RunAiAssistOptions,
  ): Promise<Result<AiAssistOutcome, AppError>>;
}

export interface DataManagementRuntimeServices {
  inspect(): Promise<DataHealthReport>;
  rebuildSearchIndex(options?: SearchRebuildOptions): Promise<SearchRebuildResult>;
}

export const AppServicesContext = createContext<AppRuntimeServices | null>(null);

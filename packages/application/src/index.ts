export { mapApplicationError, validationError } from "./errors.js";
export {
  createImportSession,
  detectImportDate,
  normalizeImportRelativePath,
  type CreateImportSessionInput,
  type ImportEntry,
  type ImportEntryStatus,
  type ImportRawCaptureStatus,
  type ImportSession,
  type ImportSessionStatus,
  type ImportDateDetection,
  type ImportDateSource,
} from "@dailyflow/domain";
export type {
  AppServices,
  ApplicationDependencies,
  ApplicationUseCases,
} from "./services/app-services.js";
export { createAppServices } from "./services/app-services.js";
export { PortError, type PortErrorCode, type PortErrorDetails } from "./ports/port-error.js";
export type { Page, PageRequest } from "./ports/pagination.js";
export type {
  ContentProjector,
  ContentProjectorInput,
  JournalListQuery,
  JournalRepository,
  JournalSaveCheckpoint,
  JournalSaveState,
  JournalSummary,
  JournalVersionSummary,
  ProjectedContent,
  RestoreJournalVersionInput,
  SearchProjectionContext,
  SavedJournalSnapshot,
  SaveJournalSnapshot,
  StructuredBlockProjection,
} from "./ports/journal-repository.js";
export type {
  KnowledgeListQuery,
  KnowledgeRepository,
  KnowledgeSummary,
} from "./ports/knowledge-repository.js";
export type { TaskListQuery, TaskRepository } from "./ports/task-repository.js";
export type {
  AnalyticsDailyActivity,
  AnalyticsJournalSource,
  AnalyticsKnowledgeSource,
  AnalyticsPeriod,
  AnalyticsQuery,
  AnalyticsSource,
  AnalyticsSummary,
  AnalyticsTagCount,
  AnalyticsTaskSource,
} from "./queries/analytics-query.js";
export type {
  TimelineCalendarQuery,
  TimelineDaySummary,
  TimelineListQuery,
  TimelineQuery,
} from "./queries/timeline-query.js";
export {
  buildAnalyticsSummary,
  resolveAnalyticsPeriod,
  shiftAnalyticsPeriod,
} from "./queries/analytics-query.js";
export type { ReportPeriodKey, ReportRepository } from "./ports/report-repository.js";
export { buildTaskListQuery, isTaskOverdue, type TaskListView } from "./queries/task-list-query.js";
export type {
  AttachmentStore,
  PutAttachmentInput,
  StoredAttachment,
} from "./ports/attachment-store.js";
export type {
  CommitImportInput,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewCounts,
  ImportPreviewEntry,
  ImportConflictPolicy,
  ImportRoot,
  ImportScanOptions,
  ImportService,
  ImportSource,
  ImportTxtAnalysis,
  ImportTxtAnalyzer,
  RawImportFile,
  TxtDocumentConverter,
} from "./ports/import-service.js";
export type {
  BeginImportCommitInput,
  ImportCommitBatchInput,
  ImportCommitEntry,
  ImportCommitSummary,
  ImportExistingMatch,
  ImportRepository,
  RecordImportFailureInput,
} from "./ports/import-repository.js";
export {
  TxtImportService,
  type TxtImportServiceDependencies,
} from "./imports/txt-import-service.js";
export type {
  BackupArchiveFile,
  BackupArchiveLimits,
  BackupArtifact,
  BackupAttachmentRecord,
  BackupDataset,
  BackupManifest,
  BackupRow,
  BackupCreateOptions,
  BackupRestoreOptions,
  BackupRestoreResult,
  BackupSafetySnapshot,
  BackupSaveResult,
  BackupService,
  BackupSource,
  BackupSourceFile,
  BackupTarget,
  BackupValidationErrorCode,
  BuildBackupArchiveOptions,
  InspectedBackup,
} from "./ports/backup-service.js";
export {
  CreateBackupInputSchema,
  createBackup,
  type CreateBackupDependencies,
  type CreateBackupOutcome,
} from "./use-cases/create-backup.js";
export {
  InspectBackupInputSchema,
  inspectBackup,
  type InspectBackupDependencies,
} from "./use-cases/inspect-backup.js";
export {
  RestoreBackupInputSchema,
  restoreBackup,
  type RestoreBackupDependencies,
} from "./use-cases/restore-backup.js";
export {
  EXPORT_SCOPES,
  type ExportArtifact,
  type ExportAttachmentRecord,
  type ExportArchiveOptions,
  type ExportDataOutcome,
  type ExportDataResult,
  type ExportDataset,
  type ExportEstimate,
  type ExportFile,
  type ExportFileManifestEntry,
  type ExportImportEntryRecord,
  type ExportImportSnapshot,
  type ExportJournalRecord,
  type ExportKnowledgeRecord,
  type ExportManifest,
  type ExportOptions,
  type ExportSaveResult,
  type ExportScope,
  type ExportSource,
  type ExportTarget,
} from "./ports/export-target.js";
export {
  ExportDataInputSchema,
  exportData,
  type ExportDataDependencies,
} from "./use-cases/export-data.js";
export type {
  SearchDocument,
  SearchEntityType,
  SearchHit,
  SearchPort,
  SearchQuery,
  SearchRebuildOptions,
  SearchRebuildProgress,
  SearchRebuildResult,
  SearchResultPage,
} from "./ports/search-port.js";
export { SEARCH_ENTITY_TYPES } from "./ports/search-port.js";
export type {
  DataHealthFacts,
  DataHealthSnapshot,
  DataManagementPort,
  DataStorageSummary,
  StorageKind,
} from "./ports/data-management-port.js";
export {
  buildDataHealthReport,
  checkDataHealth,
  type CheckDataHealthDependencies,
  type DataHealthIssue,
  type DataHealthIssueCode,
  type DataHealthReport,
  type DataHealthSeverity,
  type DataHealthStatus,
} from "./use-cases/check-data-health.js";
export {
  rebuildSearchIndex,
  type RebuildSearchIndexDependencies,
} from "./use-cases/rebuild-search-index.js";
export type { Clock } from "./ports/clock.js";
export type {
  AiCancellation,
  AiCompletionRequest,
  AiContextPart,
  AiProviderDescriptor,
  AiProviderPort,
  AiProviderRegistry,
  AiPurpose,
} from "./ports/ai-provider.js";
export type { SecretStore, SecretStoreBackend } from "./ports/secret-store.js";
export {
  prepareAiAssist,
  runAiAssist,
  type AiAssistDraft,
  type AiAssistOutcome,
  type AiAssistPreview,
  type AiAssistPreviewPart,
  type PrepareAiAssistDependencies,
  type RunAiAssistDependencies,
  type RunAiAssistOptions,
} from "./use-cases/run-ai-assist.js";
export type { SettingsStore } from "./ports/settings-store.js";
export {
  AccentPreferenceSchema,
  DEFAULT_USER_PREFERENCES,
  DensityPreferenceSchema,
  EditorWidthPreferenceSchema,
  HistoryRetentionSchema,
  LocalePreferenceSchema,
  SETTINGS_KEYS,
  ThemePreferenceSchema,
  UserPreferencesSchema,
  loadUserPreferences,
  saveUserPreferences,
  type AccentPreference,
  type DensityPreference,
  type EditorWidthPreference,
  type HistoryRetention,
  type LocalePreference,
  type SettingsWarning,
  type SettingsWarningCode,
  type ThemePreference,
  type UserPreferences,
  type UserPreferencesDependencies,
  type UserPreferencesLoadResult,
  type UserPreferencesSaveResult,
} from "./use-cases/settings.js";
export {
  CreateTaskInputSchema,
  createTask,
  type CreateTaskDependencies,
} from "./use-cases/create-task.js";
export {
  CompleteTaskInputSchema,
  completeTask,
  type CompleteTaskDependencies,
} from "./use-cases/complete-task.js";
export {
  ReopenTaskInputSchema,
  reopenTask,
  type ReopenTaskDependencies,
} from "./use-cases/reopen-task.js";
export {
  UpdateTaskInputSchema,
  updateTask,
  type UpdateTaskDependencies,
} from "./use-cases/update-task.js";
export { generateReportDraft, type ReportDraft } from "./use-cases/generate-report-draft.js";
export {
  SaveReportDraftInputSchema,
  saveReportDraft,
  type SaveReportDraftDependencies,
} from "./use-cases/save-report-draft.js";
export {
  GetJournalInputSchema,
  getJournal,
  type GetJournalDependencies,
  type JournalLookup,
} from "./use-cases/get-journal.js";
export {
  PromoteToKnowledgeInputSchema,
  promoteToKnowledge,
  type PromoteToKnowledgeDependencies,
} from "./use-cases/promote-to-knowledge.js";
export {
  RestoreJournalVersionInputSchema,
  restoreJournalVersion,
  type RestoreJournalVersionDependencies,
} from "./use-cases/restore-journal-version.js";
export {
  SaveJournalInputSchema,
  saveJournal,
  type SaveJournalDependencies,
} from "./use-cases/save-journal.js";
export {
  EntityIdSchema,
  JsonObjectSchema,
  LocalDateSchema,
  PositiveIntegerSchema,
} from "./validation.js";
export {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  DEFAULT_ATTACHMENT_POLICY,
  addAttachment,
  type AddAttachmentDependencies,
  type AddAttachmentInput,
  type AddAttachmentResult,
  type AttachmentMimeType,
  type AttachmentPolicy,
} from "./use-cases/add-attachment.js";

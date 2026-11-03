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
  BackupManifest,
  BackupOptions,
  BackupResult,
  BackupService,
  BackupSource,
  RestoreOptions,
  RestoreResult,
} from "./ports/backup-service.js";
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
  SearchRebuildResult,
  SearchResultPage,
} from "./ports/search-port.js";
export { SEARCH_ENTITY_TYPES } from "./ports/search-port.js";
export type { Clock } from "./ports/clock.js";
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

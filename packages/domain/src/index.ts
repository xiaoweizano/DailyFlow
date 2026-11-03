export { DomainRuleError } from "./shared/errors.js";
export type { Clock, DomainDependencies, IdGenerator } from "./shared/ports.js";
export {
  createContentDocument,
  isJsonObject,
  parsePositiveInteger,
  type ContentDocument,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from "./shared/content.js";
export {
  createTagName,
  nextEntityId,
  nowUtc,
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  requireNonEmptyString,
  type ContentHash,
  type EntityId,
  type LocalDate,
  type Revision,
  type TagName,
  type UtcTimestamp,
} from "./shared/value-objects.js";

export {
  JOURNAL_STATUSES,
  assertJournalStatus,
  createJournal,
  setJournalContentHash,
  type CreateJournalInput,
  type Journal,
  type JournalStatus,
} from "./journal/journal.js";
export {
  CHANGE_SOURCES,
  createJournalVersion,
  type ChangeSource,
  type CreateJournalVersionInput,
  type JournalVersion,
} from "./journal/journal-version.js";
export {
  STRUCTURED_BLOCK_TYPES,
  createStructuredBlock,
  updateStructuredBlock,
  type CreateStructuredBlockInput,
  type StructuredBlock,
  type StructuredBlockType,
  type UpdateStructuredBlockInput,
} from "./journal/structured-block.js";
export {
  KNOWLEDGE_KINDS,
  KNOWLEDGE_STATUSES,
  createKnowledgeItem,
  type CreateKnowledgeItemInput,
  type KnowledgeItem,
  type KnowledgeKind,
  type KnowledgeStatus,
} from "./knowledge/knowledge-item.js";
export {
  TASK_PRIORITIES,
  TASK_STATUSES,
  createTask,
  markTaskDone,
  reopenTask,
  type CreateTaskInput,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./tasks/task.js";
export { createTag, type CreateTagInput, type Tag } from "./tags/tag.js";
export {
  ATTACHMENT_OWNER_TYPES,
  ATTACHMENT_STORAGE_KINDS,
  createAttachmentRef,
  type AttachmentOwnerType,
  type AttachmentRef,
  type AttachmentStorageKind,
  type CreateAttachmentRefInput,
} from "./attachments/attachment.js";
export {
  IMPORT_CONFLICT_KINDS,
  IMPORT_ENCODINGS,
  IMPORT_ENTRY_STATUSES,
  IMPORT_NEWLINE_STYLES,
  IMPORT_RAW_CAPTURE_STATUSES,
  IMPORT_SESSION_STATUSES,
  createImportSession,
  type CreateImportSessionInput,
  type ImportConflictKind,
  type ImportEncoding,
  type ImportEntry,
  type ImportEntryStatus,
  type ImportNewlineStyle,
  type ImportRawCaptureStatus,
  type ImportSession,
  type ImportSessionStatus,
} from "./imports/import-session.js";
export {
  detectImportDate,
  normalizeImportRelativePath,
  type ImportDateDetection,
  type ImportDateSource,
} from "./imports/import-rules.js";
export {
  REPORT_GENERATORS,
  REPORT_PERIOD_TYPES,
  createReport,
  type CreateReportInput,
  type Report,
  type ReportGenerator,
  type ReportPeriodType,
} from "./reports/report.js";

import { JsonObjectSchema, PortError, type PortErrorCode } from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
  STRUCTURED_BLOCK_TYPES,
  type ContentHash,
  type EntityId,
  type LocalDate,
  type UtcTimestamp,
} from "@dailyflow/domain";
import { z } from "zod";

export const TAURI_COMMANDS = {
  journalGetByDate: "journal_get_by_date",
  journalGetById: "journal_get_by_id",
  journalGetSaveState: "journal_get_save_state",
  journalListSummaries: "journal_list_summaries",
  journalSaveSnapshot: "journal_save_snapshot",
  journalListVersions: "journal_list_versions",
  journalGetVersion: "journal_get_version",
  journalRestoreVersion: "journal_restore_version",
  journalSoftDelete: "journal_soft_delete",
  taskGetById: "task_get_by_id",
  taskList: "task_list",
  taskSave: "task_save",
  taskComplete: "task_complete",
  taskSoftDelete: "task_soft_delete",
  knowledgeGetById: "knowledge_get_by_id",
  knowledgeList: "knowledge_list",
  knowledgeSave: "knowledge_save",
  knowledgeSoftDelete: "knowledge_soft_delete",
  timelineGetCalendar: "timeline_get_calendar",
  timelineListEntries: "timeline_list_entries",
  analyticsGetSource: "analytics_get_source",
  reportGetByPeriod: "report_get_by_period",
  reportSave: "report_save",
  searchQuery: "search_query",
  searchRebuild: "search_rebuild",
  searchCancelRebuild: "search_cancel_rebuild",
  dataHealthInspect: "data_health_inspect",
  attachmentPut: "attachment_put",
  attachmentRead: "attachment_read",
  attachmentSoftDeleteOwnerLinks: "attachment_soft_delete_owner_links",
  attachmentRemoveOrphan: "attachment_remove_orphan",
  importScanTxt: "import_scan_txt",
  importReadTxt: "import_read_txt",
  importCreateSession: "import_create_session",
  importSavePreview: "import_save_preview",
  importFindExistingMatches: "import_find_existing_matches",
  importBeginCommit: "import_begin_commit",
  importCommitBatch: "import_commit_batch",
  importRecordFailure: "import_record_failure",
  exportSnapshot: "export_snapshot",
  exportWriteFile: "export_write_file",
  backupSnapshot: "backup_snapshot",
  backupReadFile: "backup_read_file",
  backupWriteFile: "backup_write_file",
  backupRestore: "backup_restore",
  settingsRead: "settings_read",
  settingsWrite: "settings_write",
} as const;

export type TauriCommandName = (typeof TAURI_COMMANDS)[keyof typeof TAURI_COMMANDS];

const UuidV7Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  .transform<EntityId>((value) => parseEntityId(value));

const ContentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/u)
  .transform<ContentHash>((value) => parseContentHash(value));

const UtcTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  .transform<UtcTimestamp>((value) => parseUtcTimestamp(value));

const LocalDateDtoSchema = z
  .string()
  .refine((value) => {
    try {
      parseLocalDate(value);
      return true;
    } catch {
      return false;
    }
  }, "Must be a valid local date.")
  .transform<LocalDate>((value) => parseLocalDate(value));

export const SettingsReadResultDtoSchema = z.object({
  valueJson: z.string().nullable(),
});

export type SettingsReadResultDto = z.infer<typeof SettingsReadResultDtoSchema>;

export const JournalSaveCheckpointSchema = z.enum(["autosave", "explicit", "restore", "import"]);

export const JournalChangeSourceSchema = z.enum([
  "autosave",
  "explicit",
  "restore",
  "import",
  "migration",
]);

export const SearchEntityTypeSchema = z.enum([
  "journal",
  "knowledge_item",
  "task",
  "structured_block",
]);

const StructuredBlockTypeSchema = z.enum(STRUCTURED_BLOCK_TYPES);

export const StructuredBlockDtoSchema = z.object({
  id: UuidV7Schema,
  blockType: StructuredBlockTypeSchema,
  schemaVersion: z.number().int().positive(),
  data: JsonObjectSchema,
  orderKey: z.string().min(1),
  renderedText: z.string(),
});

export const SearchDocumentDtoSchema = z.object({
  id: UuidV7Schema,
  entityType: SearchEntityTypeSchema,
  entityId: UuidV7Schema,
  title: z.string(),
  bodyText: z.string(),
  structuredText: z.string(),
  tagsText: z.string(),
  normalizedText: z.string(),
  tokenizedText: z.string(),
  localDate: LocalDateDtoSchema.nullable(),
  updatedAt: UtcTimestampSchema,
  contentHash: ContentHashSchema,
  indexVersion: z.number().int().positive(),
});

export const SaveJournalSnapshotDtoSchema = z.object({
  journalId: UuidV7Schema,
  journalDate: LocalDateDtoSchema,
  timezone: z.string().min(1),
  title: z.string(),
  contentJson: JsonObjectSchema,
  editorSchemaVersion: z.number().int().positive(),
  contentMarkdown: z.string(),
  contentPlainText: z.string(),
  contentHash: ContentHashSchema,
  projectionVersion: z.number().int().positive(),
  excerpt: z.string(),
  expectedRevision: z.number().int().nonnegative().nullable(),
  checkpoint: JournalSaveCheckpointSchema,
  tags: z.array(z.string()),
  structuredBlocks: z.array(StructuredBlockDtoSchema),
  searchDocuments: z.array(SearchDocumentDtoSchema),
  savedAt: UtcTimestampSchema,
});

export const SavedJournalSnapshotDtoSchema = z.object({
  journalId: UuidV7Schema,
  revision: z.number().int().positive(),
  savedAt: UtcTimestampSchema,
  contentHash: ContentHashSchema,
  versionCreated: z.boolean(),
  searchIndexState: z.enum(["ready", "stale"]),
});

export const JournalDtoSchema = z.object({
  id: UuidV7Schema,
  journalDate: LocalDateDtoSchema,
  timezone: z.string().min(1),
  title: z.string(),
  contentJson: JsonObjectSchema,
  contentMarkdown: z.string(),
  contentPlainText: z.string(),
  editorSchemaVersion: z.number().int().positive(),
  projectionVersion: z.number().int().positive(),
  contentHash: ContentHashSchema,
  excerpt: z.string(),
  status: z.enum(["active", "archived"]),
  revision: z.number().int().nonnegative(),
  createdAt: UtcTimestampSchema,
  updatedAt: UtcTimestampSchema,
  deletedAt: UtcTimestampSchema.nullable(),
  tags: z.array(z.string()),
  structuredBlocks: z.array(StructuredBlockDtoSchema),
});

export const JournalSaveStateDtoSchema = z.object({
  journalId: UuidV7Schema,
  journalDate: LocalDateDtoSchema,
  timezone: z.string().min(1),
  revision: z.number().int().nonnegative(),
  title: z.string(),
  contentHash: ContentHashSchema,
  projectionVersion: z.number().int().positive(),
  tags: z.array(z.string()),
  updatedAt: UtcTimestampSchema,
});

export const JournalSummaryDtoSchema = z.object({
  id: UuidV7Schema,
  journalDate: LocalDateDtoSchema,
  title: z.string(),
  excerpt: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: UtcTimestampSchema,
});

export const JournalVersionSummaryDtoSchema = z.object({
  journalId: UuidV7Schema,
  revision: z.number().int().nonnegative(),
  title: z.string(),
  changeSource: JournalChangeSourceSchema,
  createdAt: UtcTimestampSchema,
});

export const JournalVersionDtoSchema = z.object({
  id: UuidV7Schema,
  journalId: UuidV7Schema,
  revision: z.number().int().nonnegative(),
  title: z.string(),
  contentJson: JsonObjectSchema,
  contentMarkdown: z.string(),
  contentPlainText: z.string(),
  editorSchemaVersion: z.number().int().positive(),
  projectionVersion: z.number().int().positive(),
  contentHash: ContentHashSchema,
  changeSource: JournalChangeSourceSchema,
  createdAt: UtcTimestampSchema,
});

export const JournalListQueryDtoSchema = z.object({
  fromDate: LocalDateDtoSchema.optional(),
  toDate: LocalDateDtoSchema.optional(),
  status: z.enum(["active", "archived"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const TaskStatusDtoSchema = z.enum(["open", "in_progress", "done", "cancelled"]);
export const TaskPriorityDtoSchema = z.enum(["low", "normal", "high", "urgent"]);

export const TaskDtoSchema = z.object({
  id: UuidV7Schema,
  title: z.string().min(1).max(500),
  descriptionJson: JsonObjectSchema.nullable(),
  descriptionText: z.string(),
  status: TaskStatusDtoSchema,
  priority: TaskPriorityDtoSchema,
  dueDate: LocalDateDtoSchema.nullable(),
  completedAt: UtcTimestampSchema.nullable(),
  journalId: UuidV7Schema.nullable(),
  knowledgeItemId: UuidV7Schema.nullable(),
  revision: z.number().int().positive(),
  createdAt: UtcTimestampSchema,
  updatedAt: UtcTimestampSchema,
  deletedAt: UtcTimestampSchema.nullable(),
});

const TaskWriteDtoSchema = TaskDtoSchema.extend({
  revision: z.number().int().nonnegative(),
});

export const TaskSaveCommandDtoSchema = z.object({
  task: TaskWriteDtoSchema,
  expectedRevision: z.number().int().positive().nullable(),
});

export const TaskCompleteCommandDtoSchema = z.object({
  taskId: UuidV7Schema,
  completedAt: UtcTimestampSchema,
  expectedRevision: z.number().int().positive(),
});

export const TaskSoftDeleteCommandDtoSchema = z.object({
  taskId: UuidV7Schema,
  expectedRevision: z.number().int().positive(),
  deletedAt: UtcTimestampSchema,
});

export const TaskListQueryDtoSchema = z.object({
  status: z.array(TaskStatusDtoSchema).optional(),
  dueFrom: LocalDateDtoSchema.optional(),
  dueTo: LocalDateDtoSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const TaskPageDtoSchema = pageDtoSchema(TaskDtoSchema);

export const KnowledgeKindDtoSchema = z.enum([
  "note",
  "issue",
  "solution",
  "decision",
  "reference",
]);
export const KnowledgeStatusDtoSchema = z.enum(["active", "archived"]);

export const KnowledgeItemDtoSchema = z.object({
  id: UuidV7Schema,
  kind: KnowledgeKindDtoSchema,
  status: KnowledgeStatusDtoSchema,
  title: z.string().min(1).max(500),
  contentJson: JsonObjectSchema,
  editorSchemaVersion: z.number().int().positive(),
  contentHash: ContentHashSchema.nullable(),
  projectionVersion: z.number().int().positive(),
  summary: z.string(),
  revision: z.number().int().positive(),
  sourceJournalId: UuidV7Schema.nullable(),
  sourceBlockId: UuidV7Schema.nullable(),
  createdAt: UtcTimestampSchema,
  updatedAt: UtcTimestampSchema,
  deletedAt: UtcTimestampSchema.nullable(),
});

export const KnowledgeListQueryDtoSchema = z.object({
  kind: KnowledgeKindDtoSchema.optional(),
  status: KnowledgeStatusDtoSchema.optional(),
  fromDate: LocalDateDtoSchema.optional(),
  toDate: LocalDateDtoSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const KnowledgeSaveCommandDtoSchema = z.object({
  item: KnowledgeItemDtoSchema,
  expectedRevision: z.number().int().positive().nullable(),
});

export const KnowledgeSoftDeleteCommandDtoSchema = z.object({
  knowledgeItemId: UuidV7Schema,
  expectedRevision: z.number().int().positive(),
  deletedAt: UtcTimestampSchema,
});

export const KnowledgePageDtoSchema = pageDtoSchema(KnowledgeItemDtoSchema);

const TimelineDateRangeShape = {
  fromDate: LocalDateDtoSchema.optional(),
  toDate: LocalDateDtoSchema.optional(),
};

function validateOptionalDateRange(
  value: {
    readonly fromDate?: LocalDate | undefined;
    readonly toDate?: LocalDate | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (value.fromDate !== undefined && value.toDate !== undefined && value.fromDate > value.toDate) {
    context.addIssue({
      code: "custom",
      message: "fromDate must be on or before toDate",
      path: ["fromDate"],
    });
  }
}

export const TimelineCalendarQueryDtoSchema = z
  .object({
    from: LocalDateDtoSchema,
    to: LocalDateDtoSchema,
  })
  .superRefine((value, context) => {
    if (value.from > value.to) {
      context.addIssue({
        code: "custom",
        message: "from must be on or before to",
        path: ["from"],
      });
    }
  });

export const TimelineListQueryDtoSchema = z
  .object({
    ...TimelineDateRangeShape,
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .superRefine(validateOptionalDateRange);

export const TimelineDaySummaryDtoSchema = z.object({
  date: LocalDateDtoSchema,
  journalId: UuidV7Schema.nullable(),
  journalCount: z.number().int().nonnegative(),
  taskDueCount: z.number().int().nonnegative(),
  title: z.string(),
  excerpt: z.string(),
  updatedAt: UtcTimestampSchema.nullable(),
});

export const TimelineDaySummaryPageDtoSchema = pageDtoSchema(TimelineDaySummaryDtoSchema);

export const AnalyticsPeriodQueryDtoSchema = z
  .object({
    start: LocalDateDtoSchema,
    end: LocalDateDtoSchema,
    timezone: z.string().min(1),
  })
  .superRefine((value, context) => {
    if (value.start > value.end) {
      context.addIssue({
        code: "custom",
        message: "start must be on or before end",
        path: ["start"],
      });
    }
  });

export const AnalyticsJournalSourceDtoSchema = z.object({
  id: UuidV7Schema,
  journalDate: LocalDateDtoSchema,
  title: z.string(),
  contentPlainText: z.string(),
  tags: z.array(z.string()),
  deletedAt: UtcTimestampSchema.nullable(),
});

export const AnalyticsTaskSourceDtoSchema = z.object({
  id: UuidV7Schema,
  status: TaskStatusDtoSchema,
  completedAt: UtcTimestampSchema.nullable(),
  deletedAt: UtcTimestampSchema.nullable(),
});

export const AnalyticsKnowledgeSourceDtoSchema = z.object({
  id: UuidV7Schema,
  kind: KnowledgeKindDtoSchema,
  title: z.string(),
  createdAt: UtcTimestampSchema,
  tags: z.array(z.string()),
  deletedAt: UtcTimestampSchema.nullable(),
});

export const AnalyticsSourceDtoSchema = z.object({
  journals: z.array(AnalyticsJournalSourceDtoSchema),
  tasks: z.array(AnalyticsTaskSourceDtoSchema),
  knowledge: z.array(AnalyticsKnowledgeSourceDtoSchema),
});

export const ReportPeriodQueryDtoSchema = z.object({
  periodType: z.enum(["week", "month", "year"]),
  periodStart: LocalDateDtoSchema,
  periodEnd: LocalDateDtoSchema,
  timezone: z.string().min(1),
});

const JsonStringSchema = z.string().refine((value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}, "Must be valid JSON.");

export const ReportDtoSchema = z.object({
  id: UuidV7Schema,
  periodType: z.enum(["week", "month", "year"]),
  periodStart: LocalDateDtoSchema,
  periodEnd: LocalDateDtoSchema,
  timezone: z.string().min(1),
  title: z.string().min(1).max(500),
  contentJson: JsonObjectSchema,
  editorSchemaVersion: z.number().int().positive(),
  contentMarkdown: z.string(),
  contentPlainText: z.string(),
  projectionVersion: z.number().int().positive(),
  statsJson: JsonStringSchema,
  generatedBy: z.enum(["local", "ai_assisted"]),
  sourceWatermark: UtcTimestampSchema.nullable(),
  revision: z.number().int().positive(),
  createdAt: UtcTimestampSchema,
  updatedAt: UtcTimestampSchema,
  deletedAt: UtcTimestampSchema.nullable(),
});

const ReportWriteDtoSchema = ReportDtoSchema.extend({
  revision: z.number().int().nonnegative(),
});

export const ReportSaveCommandDtoSchema = z.object({
  report: ReportWriteDtoSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export function pageDtoSchema<S extends z.ZodTypeAny>(itemSchema: S) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}

export const JournalSummaryPageDtoSchema = pageDtoSchema(JournalSummaryDtoSchema);
export const JournalVersionSummaryPageDtoSchema = pageDtoSchema(JournalVersionSummaryDtoSchema);

export const RestoreJournalVersionDtoSchema = z.object({
  journalId: UuidV7Schema,
  versionRevision: z.number().int().positive(),
  expectedCurrentRevision: z.number().int().nonnegative(),
  restoredAt: UtcTimestampSchema,
});

export const SearchQueryDtoSchema = z.object({
  text: z.string(),
  entityTypes: z.array(SearchEntityTypeSchema).optional(),
  fromDate: LocalDateDtoSchema.optional(),
  toDate: LocalDateDtoSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const SearchHitDtoSchema = z.object({
  entityType: SearchEntityTypeSchema,
  entityId: UuidV7Schema,
  title: z.string(),
  snippet: z.string(),
  localDate: LocalDateDtoSchema.nullable(),
  score: z.number().finite(),
});

export const SearchResultPageDtoSchema = pageDtoSchema(SearchHitDtoSchema).extend({
  indexState: z.enum(["ready", "stale", "failed"]),
});

export const SearchRebuildResultDtoSchema = z.object({
  indexedCount: z.number().int().nonnegative(),
  completedAt: UtcTimestampSchema,
  status: z.enum(["completed", "cancelled"]),
});

export const SEARCH_REBUILD_PROGRESS_EVENT = "search-rebuild-progress";

export const SearchRebuildProgressEventDtoSchema = z.object({
  requestId: z.string().min(1),
  phase: z.enum(["reading", "indexing", "committing"]),
  processedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});

export type SearchRebuildProgressEventDto = z.infer<typeof SearchRebuildProgressEventDtoSchema>;

export const DataHealthFactsDtoSchema = z.object({
  integrity: z.string(),
  foreignKeyViolationCount: z.number().int().nonnegative(),
  duplicateJournalDateCount: z.number().int().nonnegative(),
  orphanedAttachmentCount: z.number().int().nonnegative(),
  invalidAttachmentLinkCount: z.number().int().nonnegative(),
  invalidTaskRelationCount: z.number().int().nonnegative(),
  indexedDocumentCount: z.number().int().nonnegative(),
  authoritativeDocumentCount: z.number().int().nonnegative(),
  staleProjectionCount: z.number().int().nonnegative(),
  staleIndexVersionCount: z.number().int().nonnegative(),
  searchIndexState: z.enum(["ready", "stale", "failed"]),
  lastBackupAt: UtcTimestampSchema.nullable(),
});

export const DataStorageSummaryDtoSchema = z.object({
  storageKind: z.literal("sqlite"),
  locationLabel: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  usageBytes: z.number().int().nonnegative(),
  quotaBytes: z.number().int().nonnegative().nullable(),
  persisted: z.boolean(),
  journalCount: z.number().int().nonnegative(),
  knowledgeItemCount: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  rawImportByteCount: z.number().int().nonnegative(),
  searchDocumentCount: z.number().int().nonnegative(),
  lastBackupAt: UtcTimestampSchema.nullable(),
});

export const DataHealthSnapshotDtoSchema = z.object({
  facts: DataHealthFactsDtoSchema,
  storage: DataStorageSummaryDtoSchema,
});

export const AttachmentOwnerTypeDtoSchema = z.enum([
  "journal",
  "knowledge_item",
  "structured_block",
]);

export const AttachmentPutCommandDtoSchema = z.object({
  ownerType: AttachmentOwnerTypeDtoSchema,
  ownerId: UuidV7Schema,
  displayName: z.string().min(1).max(255),
  mimeType: z.string(),
  bytesBase64: z.string(),
  altText: z.string().max(500),
  isInline: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: UtcTimestampSchema,
});

export const AttachmentRefDtoSchema = z.object({
  id: UuidV7Schema,
  blobId: UuidV7Schema,
  ownerType: AttachmentOwnerTypeDtoSchema,
  ownerId: UuidV7Schema,
  displayName: z.string(),
  altText: z.string(),
  isInline: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  storageKind: z.literal("desktop-file"),
  storageKey: z.string().min(1),
  sha256: ContentHashSchema,
  createdAt: UtcTimestampSchema,
  deletedAt: UtcTimestampSchema.nullable(),
});

export const StoredAttachmentDtoSchema = z.object({
  attachment: AttachmentRefDtoSchema,
  contentHash: ContentHashSchema,
  byteSize: z.number().int().nonnegative(),
});

export const AttachmentDataDtoSchema = z.object({
  mimeType: z.string().min(1),
  bytesBase64: z.string(),
});

export const AttachmentSoftDeleteOwnerLinksDtoSchema = z.object({
  ownerType: AttachmentOwnerTypeDtoSchema,
  ownerId: UuidV7Schema,
  deletedAt: UtcTimestampSchema,
});

export const ImportScanCandidateDtoSchema = z.object({
  relativePath: z.string().min(1),
  fileName: z.string().min(1),
  byteSize: z.number().int().nonnegative().nullable(),
  lastModifiedMs: z.number().int().nonnegative().nullable(),
});

export const ImportScanResultDtoSchema = z.object({
  rootLabel: z.string().min(1),
  candidates: z.array(ImportScanCandidateDtoSchema),
  ignoredEntryCount: z.number().int().nonnegative(),
});

export const ImportTxtFileDtoSchema = z.object({
  relativePath: z.string().min(1),
  fileName: z.string().min(1),
  bytesBase64: z.string(),
  byteSize: z.number().int().nonnegative(),
  lastModifiedMs: z.number().int().nonnegative().nullable(),
});

const ImportEncodingDtoSchema = z.enum(["utf8-bom", "utf8", "gb18030", "unknown"]);
const ImportNewlineStyleDtoSchema = z.enum(["lf", "crlf", "mixed", "unknown"]);
const ImportRawCaptureStatusDtoSchema = z.enum(["captured", "cleaned", "unavailable"]);
const ImportEntryStatusDtoSchema = z.enum([
  "ready",
  "skipped",
  "conflict",
  "invalid",
  "imported",
  "failed",
]);
const ImportConflictKindDtoSchema = z.enum([
  "duplicate_path",
  "duplicate_content",
  "same_date_conflict",
  "duplicate_date_in_batch",
]);

export const ImportEntryDtoSchema = z
  .object({
    id: UuidV7Schema,
    relativePath: z.string().min(1),
    originalFileName: z.string().min(1),
    detectedDate: LocalDateDtoSchema.nullable(),
    encoding: ImportEncodingDtoSchema,
    newlineStyle: ImportNewlineStyleDtoSchema,
    fileSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    rawSize: z.number().int().nonnegative().nullable(),
    rawCaptureStatus: ImportRawCaptureStatusDtoSchema,
    rawBytesBase64: z.string().nullable(),
    rawCleanedAt: UtcTimestampSchema.nullable(),
    status: ImportEntryStatusDtoSchema,
    conflictKind: ImportConflictKindDtoSchema.nullable(),
    errorCode: z.string().nullable(),
    errorDetail: z.string().nullable(),
    journalId: UuidV7Schema.nullable(),
    previousJournalRevision: z.number().int().positive().nullable(),
    createdAt: UtcTimestampSchema,
    committedAt: UtcTimestampSchema.nullable(),
  })
  .strict();

export const ImportSessionDtoSchema = z
  .object({
    id: UuidV7Schema,
    rootLabel: z.string().min(1),
    status: z.enum([
      "scanning",
      "preview_ready",
      "committing",
      "completed",
      "failed",
      "rolled_back",
    ]),
    options: JsonObjectSchema,
    revision: z.number().int().positive(),
    scannedCount: z.number().int().nonnegative(),
    readyCount: z.number().int().nonnegative(),
    importedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    invalidCount: z.number().int().nonnegative(),
    entries: z.array(ImportEntryDtoSchema),
    createdAt: UtcTimestampSchema,
    completedAt: UtcTimestampSchema.nullable(),
    errorSummary: z.string().nullable(),
  })
  .strict();

export const ImportExistingMatchDtoSchema = z
  .object({
    relativePath: z.string().min(1).nullable(),
    detectedDate: LocalDateDtoSchema.nullable(),
    fileSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    journalId: UuidV7Schema.nullable(),
    journalRevision: z.number().int().positive().nullable(),
  })
  .strict();

export const BeginImportCommitDtoSchema = z
  .object({
    sessionId: UuidV7Schema,
    expectedRevision: z.number().int().positive(),
    startedAt: UtcTimestampSchema,
  })
  .strict();

export const ImportCommitEntryDtoSchema = z
  .object({
    entryId: UuidV7Schema,
    journalId: UuidV7Schema,
    previousJournalRevision: z.number().int().positive().nullable(),
    snapshot: SaveJournalSnapshotDtoSchema,
  })
  .strict();

export const ImportCommitBatchDtoSchema = z
  .object({
    sessionId: UuidV7Schema,
    expectedRevision: z.number().int().positive(),
    committedAt: UtcTimestampSchema,
    entries: z.array(ImportCommitEntryDtoSchema),
    skippedEntryIds: z.array(UuidV7Schema),
    failedEntryIds: z.array(UuidV7Schema),
  })
  .strict();

export const ImportCommitSummaryDtoSchema = z
  .object({
    sessionId: UuidV7Schema,
    importedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
  })
  .strict();

export const RecordImportFailureDtoSchema = z
  .object({
    sessionId: UuidV7Schema,
    expectedRevision: z.number().int().positive(),
    failedAt: UtcTimestampSchema,
    errorSummary: z.string().min(1),
    failedEntryIds: z.array(UuidV7Schema),
  })
  .strict();

export const ExportAttachmentDtoSchema = z
  .object({
    id: UuidV7Schema,
    blobId: UuidV7Schema,
    ownerType: AttachmentOwnerTypeDtoSchema,
    ownerId: UuidV7Schema,
    displayName: z.string(),
    altText: z.string(),
    isInline: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    sha256: ContentHashSchema,
    createdAt: UtcTimestampSchema,
    deletedAt: UtcTimestampSchema.nullable(),
  })
  .strict();

export const ExportKnowledgeRecordDtoSchema = z
  .object({
    item: KnowledgeItemDtoSchema,
    tags: z.array(z.string()),
  })
  .strict();

export const ExportSnapshotDtoSchema = z
  .object({
    journals: z.array(JournalDtoSchema),
    knowledge: z.array(ExportKnowledgeRecordDtoSchema),
    tasks: z.array(TaskDtoSchema),
    attachments: z.array(
      z
        .object({
          attachment: ExportAttachmentDtoSchema,
          bytesBase64: z.string(),
        })
        .strict(),
    ),
    imports: z
      .object({
        sessions: z.array(ImportSessionDtoSchema),
        entries: z.array(
          z
            .object({
              sessionId: UuidV7Schema,
              entry: ImportEntryDtoSchema,
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const ExportWriteFileInputDtoSchema = z
  .object({
    targetPath: z.string().min(1),
    bytesBase64: z.string(),
    expectedSha256: ContentHashSchema,
  })
  .strict();

export const ExportWriteFileResultDtoSchema = z
  .object({
    bytesWritten: z.number().int().nonnegative(),
  })
  .strict();

const BackupRowDtoSchema = z.record(z.unknown());

const BackupDatasetRowsDtoSchema = z
  .object({
    journals: z.array(BackupRowDtoSchema),
    journalVersions: z.array(BackupRowDtoSchema),
    structuredBlocks: z.array(BackupRowDtoSchema),
    knowledgeItems: z.array(BackupRowDtoSchema),
    knowledgeLinks: z.array(BackupRowDtoSchema),
    tasks: z.array(BackupRowDtoSchema),
    tags: z.array(BackupRowDtoSchema),
    journalTags: z.array(BackupRowDtoSchema),
    knowledgeTags: z.array(BackupRowDtoSchema),
    reports: z.array(BackupRowDtoSchema),
    importSessions: z.array(BackupRowDtoSchema),
    importEntries: z.array(BackupRowDtoSchema),
  })
  .strict();

export const BackupSnapshotDtoSchema = BackupDatasetRowsDtoSchema.extend({
  deviceId: UuidV7Schema,
  dataSchemaVersion: z.number().int().positive(),
  appVersion: z.string().min(1),
  attachments: z.array(
    z
      .object({
        link: BackupRowDtoSchema,
        blob: BackupRowDtoSchema,
        bytesBase64: z.string(),
      })
      .strict(),
  ),
}).strict();

export const BackupReadFileResultDtoSchema = z
  .object({
    bytesBase64: z.string(),
  })
  .strict();

export const BackupWriteFileInputDtoSchema = z
  .object({
    targetPath: z.string().min(1),
    bytesBase64: z.string(),
    expectedSha256: ContentHashSchema,
  })
  .strict();

export const BackupWriteFileResultDtoSchema = z
  .object({
    bytesWritten: z.number().int().nonnegative(),
  })
  .strict();

export const BackupRestoreCommandDtoSchema = z
  .object({
    expectedContentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    dataSchemaVersion: z.number().int().positive(),
    restoredAt: UtcTimestampSchema,
    dataset: BackupDatasetRowsDtoSchema,
    attachments: z.array(
      z
        .object({
          link: BackupRowDtoSchema,
          blob: BackupRowDtoSchema,
          bytesBase64: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const BackupRestoreResultDtoSchema = z
  .object({
    restoredAt: UtcTimestampSchema,
    safetySnapshot: z
      .object({
        fileName: z.string().min(1),
        contentDigest: ContentHashSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const StorageErrorDtoSchema = z.object({
  code: z.enum([
    "MIGRATION_FAILED",
    "CONFLICT",
    "NOT_FOUND",
    "VALIDATION_ERROR",
    "STORAGE_UNAVAILABLE",
    "PERMISSION_DENIED",
    "DIALOG_CANCELLED",
  ]),
  message: z.string(),
});

const STORAGE_ERROR_CODE_MAP = {
  MIGRATION_FAILED: "STORAGE_UNAVAILABLE",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  DIALOG_CANCELLED: "DIALOG_CANCELLED",
} as const satisfies Record<z.infer<typeof StorageErrorDtoSchema>["code"], PortErrorCode>;

function formatZodFields(error: z.ZodError): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? "_root" : issue.path.join(".");
    fields[field] ??= issue.message;
  }

  return fields;
}

function parseSerializedError(error: unknown): unknown {
  if (typeof error !== "string") {
    return error;
  }

  try {
    return JSON.parse(error) as unknown;
  } catch {
    return error;
  }
}

export function mapTauriError(error: unknown): PortError {
  if (error instanceof PortError) {
    return error;
  }
  if (error instanceof z.ZodError) {
    return new PortError("VALIDATION_ERROR", {
      message: "Desktop storage returned an invalid response",
      fields: formatZodFields(error),
    });
  }

  const serialized = parseSerializedError(error);
  const storageError = StorageErrorDtoSchema.safeParse(serialized);
  if (storageError.success) {
    return new PortError(STORAGE_ERROR_CODE_MAP[storageError.data.code], {
      message: storageError.data.message,
      retryable:
        storageError.data.code === "MIGRATION_FAILED" ||
        storageError.data.code === "STORAGE_UNAVAILABLE",
    });
  }

  return new PortError("STORAGE_UNAVAILABLE", {
    message: error instanceof Error ? error.message : "Desktop storage command failed",
    retryable: true,
  });
}

export type StructuredBlockDto = z.infer<typeof StructuredBlockDtoSchema>;
export type SearchDocumentDto = z.infer<typeof SearchDocumentDtoSchema>;
export type SaveJournalSnapshotDto = z.infer<typeof SaveJournalSnapshotDtoSchema>;
export type SavedJournalSnapshotDto = z.infer<typeof SavedJournalSnapshotDtoSchema>;
export type JournalDto = z.infer<typeof JournalDtoSchema>;
export type JournalSaveStateDto = z.infer<typeof JournalSaveStateDtoSchema>;
export type JournalSummaryDto = z.infer<typeof JournalSummaryDtoSchema>;
export type JournalVersionSummaryDto = z.infer<typeof JournalVersionSummaryDtoSchema>;
export type JournalVersionDto = z.infer<typeof JournalVersionDtoSchema>;
export type JournalListQueryDto = z.infer<typeof JournalListQueryDtoSchema>;
export type TaskDto = z.infer<typeof TaskDtoSchema>;
export type TaskSaveCommandDto = z.infer<typeof TaskSaveCommandDtoSchema>;
export type TaskCompleteCommandDto = z.infer<typeof TaskCompleteCommandDtoSchema>;
export type TaskSoftDeleteCommandDto = z.infer<typeof TaskSoftDeleteCommandDtoSchema>;
export type TaskListQueryDto = z.infer<typeof TaskListQueryDtoSchema>;
export type KnowledgeItemDto = z.infer<typeof KnowledgeItemDtoSchema>;
export type KnowledgeListQueryDto = z.infer<typeof KnowledgeListQueryDtoSchema>;
export type KnowledgeSaveCommandDto = z.infer<typeof KnowledgeSaveCommandDtoSchema>;
export type KnowledgeSoftDeleteCommandDto = z.infer<typeof KnowledgeSoftDeleteCommandDtoSchema>;
export type TimelineCalendarQueryDto = z.infer<typeof TimelineCalendarQueryDtoSchema>;
export type TimelineListQueryDto = z.infer<typeof TimelineListQueryDtoSchema>;
export type TimelineDaySummaryDto = z.infer<typeof TimelineDaySummaryDtoSchema>;
export type AnalyticsPeriodQueryDto = z.infer<typeof AnalyticsPeriodQueryDtoSchema>;
export type AnalyticsSourceDto = z.infer<typeof AnalyticsSourceDtoSchema>;
export type ReportPeriodQueryDto = z.infer<typeof ReportPeriodQueryDtoSchema>;
export type ReportDto = z.infer<typeof ReportDtoSchema>;
export type ReportWriteDto = z.infer<typeof ReportWriteDtoSchema>;
export type ReportSaveCommandDto = z.infer<typeof ReportSaveCommandDtoSchema>;
export type RestoreJournalVersionDto = z.infer<typeof RestoreJournalVersionDtoSchema>;
export type SearchQueryDto = z.infer<typeof SearchQueryDtoSchema>;
export type SearchHitDto = z.infer<typeof SearchHitDtoSchema>;
export type SearchResultPageDto = z.infer<typeof SearchResultPageDtoSchema>;
export type SearchRebuildResultDto = z.infer<typeof SearchRebuildResultDtoSchema>;
export type DataHealthSnapshotDto = z.infer<typeof DataHealthSnapshotDtoSchema>;
export type AttachmentOwnerTypeDto = z.infer<typeof AttachmentOwnerTypeDtoSchema>;
export type AttachmentPutCommandDto = z.infer<typeof AttachmentPutCommandDtoSchema>;
export type AttachmentRefDto = z.infer<typeof AttachmentRefDtoSchema>;
export type StoredAttachmentDto = z.infer<typeof StoredAttachmentDtoSchema>;
export type AttachmentDataDto = z.infer<typeof AttachmentDataDtoSchema>;
export type AttachmentSoftDeleteOwnerLinksDto = z.infer<
  typeof AttachmentSoftDeleteOwnerLinksDtoSchema
>;
export type ImportScanCandidateDto = z.infer<typeof ImportScanCandidateDtoSchema>;
export type ImportScanResultDto = z.infer<typeof ImportScanResultDtoSchema>;
export type ImportTxtFileDto = z.infer<typeof ImportTxtFileDtoSchema>;
export type ImportEntryDto = z.infer<typeof ImportEntryDtoSchema>;
export type ImportSessionDto = z.infer<typeof ImportSessionDtoSchema>;
export type ImportExistingMatchDto = z.infer<typeof ImportExistingMatchDtoSchema>;
export type BeginImportCommitDto = z.infer<typeof BeginImportCommitDtoSchema>;
export type ImportCommitEntryDto = z.infer<typeof ImportCommitEntryDtoSchema>;
export type ImportCommitBatchDto = z.infer<typeof ImportCommitBatchDtoSchema>;
export type ImportCommitSummaryDto = z.infer<typeof ImportCommitSummaryDtoSchema>;
export type RecordImportFailureDto = z.infer<typeof RecordImportFailureDtoSchema>;
export type ExportAttachmentDto = z.infer<typeof ExportAttachmentDtoSchema>;
export type ExportKnowledgeRecordDto = z.infer<typeof ExportKnowledgeRecordDtoSchema>;
export type ExportImportEntryDto = z.infer<
  typeof ExportSnapshotDtoSchema
>["imports"]["entries"][number];
export type ExportSnapshotDto = z.infer<typeof ExportSnapshotDtoSchema>;
export type ExportWriteFileInputDto = z.infer<typeof ExportWriteFileInputDtoSchema>;
export type ExportWriteFileResultDto = z.infer<typeof ExportWriteFileResultDtoSchema>;
export type BackupSnapshotDto = z.infer<typeof BackupSnapshotDtoSchema>;
export type BackupReadFileResultDto = z.infer<typeof BackupReadFileResultDtoSchema>;
export type BackupWriteFileInputDto = z.infer<typeof BackupWriteFileInputDtoSchema>;
export type BackupWriteFileResultDto = z.infer<typeof BackupWriteFileResultDtoSchema>;
export type BackupRestoreCommandDto = z.infer<typeof BackupRestoreCommandDtoSchema>;
export type BackupRestoreResultDto = z.infer<typeof BackupRestoreResultDtoSchema>;

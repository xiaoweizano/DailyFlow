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
  attachmentPut: "attachment_put",
  attachmentRead: "attachment_read",
  attachmentSoftDeleteOwnerLinks: "attachment_soft_delete_owner_links",
  attachmentRemoveOrphan: "attachment_remove_orphan",
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

export const TaskSaveCommandDtoSchema = z.object({
  task: TaskDtoSchema,
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

export const StorageErrorDtoSchema = z.object({
  code: z.enum([
    "MIGRATION_FAILED",
    "CONFLICT",
    "NOT_FOUND",
    "VALIDATION_ERROR",
    "STORAGE_UNAVAILABLE",
  ]),
  message: z.string(),
});

const STORAGE_ERROR_CODE_MAP = {
  MIGRATION_FAILED: "STORAGE_UNAVAILABLE",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
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
export type AttachmentOwnerTypeDto = z.infer<typeof AttachmentOwnerTypeDtoSchema>;
export type AttachmentPutCommandDto = z.infer<typeof AttachmentPutCommandDtoSchema>;
export type AttachmentRefDto = z.infer<typeof AttachmentRefDtoSchema>;
export type StoredAttachmentDto = z.infer<typeof StoredAttachmentDtoSchema>;
export type AttachmentDataDto = z.infer<typeof AttachmentDataDtoSchema>;
export type AttachmentSoftDeleteOwnerLinksDto = z.infer<
  typeof AttachmentSoftDeleteOwnerLinksDtoSchema
>;

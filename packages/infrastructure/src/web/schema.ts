import type {
  AttachmentOwnerType,
  ChangeSource,
  ContentHash,
  EntityId,
  JournalStatus,
  KnowledgeKind,
  KnowledgeStatus,
  LocalDate,
  ImportConflictKind,
  ImportEncoding,
  ImportEntryStatus,
  ImportNewlineStyle,
  ImportRawCaptureStatus,
  ImportSessionStatus,
  ReportGenerator,
  ReportPeriodType,
  StructuredBlockType,
  TaskPriority,
  TaskStatus,
  UtcTimestamp,
} from "@dailyflow/domain";
import type { SearchEntityType } from "@dailyflow/application";

export interface MetaRow {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt?: UtcTimestamp;
}

export interface JournalRow {
  readonly id: EntityId;
  readonly journalDate: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly contentJson: string;
  readonly editorSchemaVersion: number;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly status: JournalStatus;
  readonly revision: number;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface JournalVersionRow {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly revision: number;
  readonly title: string;
  readonly contentJson: string;
  readonly editorSchemaVersion: number;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly tagsJson: string;
  readonly structuredBlocksJson: string;
  readonly searchDocumentsJson: string;
  readonly changeSource: ChangeSource;
  readonly createdAt: UtcTimestamp;
}

export interface TaskRow {
  readonly id: EntityId;
  readonly title: string;
  readonly descriptionJson: string | null;
  readonly descriptionText: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: LocalDate | null;
  readonly completedAt: UtcTimestamp | null;
  readonly journalId: EntityId | null;
  readonly knowledgeItemId: EntityId | null;
  readonly revision: number;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface KnowledgeItemRow {
  readonly id: EntityId;
  readonly kind: KnowledgeKind;
  readonly status: KnowledgeStatus;
  readonly title: string;
  readonly contentJson: string;
  readonly editorSchemaVersion: number;
  readonly contentHash: ContentHash | null;
  readonly projectionVersion: number;
  readonly summary: string;
  readonly revision: number;
  readonly sourceJournalId: EntityId | null;
  readonly sourceBlockId: EntityId | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface StructuredBlockRow {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly dataJson: string;
  readonly orderKey: string;
  readonly renderedText: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface TagRow {
  readonly id: EntityId;
  readonly name: string;
  readonly nameNormalized: string;
  readonly color: string | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface JournalTagRow {
  readonly journalId: EntityId;
  readonly tagId: EntityId;
}

export interface KnowledgeTagRow {
  readonly knowledgeItemId: EntityId;
  readonly tagId: EntityId;
}

export interface SearchDocumentRow {
  readonly id: EntityId;
  readonly ownerEntityId: EntityId;
  readonly entityType: SearchEntityType;
  readonly entityId: EntityId;
  readonly title: string;
  readonly bodyText: string;
  readonly structuredText: string;
  readonly tagsText: string;
  readonly normalizedText: string;
  readonly tokenizedText: string;
  readonly localDate: LocalDate | null;
  readonly updatedAt: UtcTimestamp;
  readonly contentHash: ContentHash;
  readonly indexVersion: number;
}

export type SearchPostingField = "title" | "body" | "structured" | "tag";

export interface SearchTermPostingRow {
  readonly id: string;
  readonly term: string;
  readonly docId: EntityId;
  readonly frequency: number;
  readonly field: SearchPostingField;
}

export interface AttachmentBlobRow {
  readonly id: EntityId;
  readonly sha256: ContentHash;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly storageKind: "web-blob";
  readonly storageKey: string;
  readonly bytes: Blob;
  readonly createdAt: UtcTimestamp;
  readonly orphanedAt: UtcTimestamp | null;
}

export interface AttachmentLinkRow {
  readonly id: EntityId;
  readonly blobId: EntityId;
  readonly ownerType: AttachmentOwnerType;
  readonly ownerId: EntityId;
  readonly displayName: string;
  readonly altText: string;
  readonly isInline: boolean;
  readonly sortOrder: number;
  readonly createdAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface ImportSessionRow {
  readonly id: EntityId;
  readonly rootLabel: string;
  readonly status: ImportSessionStatus;
  readonly optionsJson: string;
  readonly revision: number;
  readonly scannedCount: number;
  readonly readyCount: number;
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly invalidCount: number;
  readonly createdAt: UtcTimestamp;
  readonly completedAt: UtcTimestamp | null;
  readonly errorSummary: string | null;
}

export interface ImportEntryRow {
  readonly id: EntityId;
  readonly sessionId: EntityId;
  readonly relativePath: string;
  readonly originalFileName: string;
  readonly detectedDate: LocalDate | null;
  readonly encoding: ImportEncoding;
  readonly newlineStyle: ImportNewlineStyle;
  readonly fileSha256: string | null;
  readonly rawSize: number | null;
  readonly rawCaptureStatus: ImportRawCaptureStatus;
  readonly rawBytes: Uint8Array | null;
  readonly rawCleanedAt: UtcTimestamp | null;
  readonly status: ImportEntryStatus;
  readonly conflictKind: ImportConflictKind | null;
  readonly errorCode: string | null;
  readonly errorDetail: string | null;
  readonly journalId: EntityId | null;
  readonly previousJournalRevision: number | null;
  readonly createdAt: UtcTimestamp;
  readonly committedAt: UtcTimestamp | null;
}

export interface ReportRow {
  readonly id: EntityId;
  readonly periodType: ReportPeriodType;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly contentJson: string;
  readonly editorSchemaVersion: number;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly projectionVersion: number;
  readonly statsJson: string;
  readonly generatedBy: ReportGenerator;
  readonly sourceWatermark: UtcTimestamp | null;
  readonly revision: number;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export type GenericStoreRow = Record<string, unknown>;

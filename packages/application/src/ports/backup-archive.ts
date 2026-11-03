import type { EntityId, UtcTimestamp } from "@dailyflow/domain";

export interface BackupRow {
  readonly id?: string;
  readonly [key: string]: unknown;
}

export interface BackupAttachmentRecord {
  readonly link: BackupRow;
  readonly blob: BackupRow;
  readonly bytes: Uint8Array;
}

export interface BackupDataset {
  readonly journals: readonly BackupRow[];
  readonly journalVersions: readonly BackupRow[];
  readonly structuredBlocks: readonly BackupRow[];
  readonly knowledgeItems: readonly BackupRow[];
  readonly knowledgeLinks: readonly BackupRow[];
  readonly tasks: readonly BackupRow[];
  readonly tags: readonly BackupRow[];
  readonly journalTags: readonly BackupRow[];
  readonly knowledgeTags: readonly BackupRow[];
  readonly reports: readonly BackupRow[];
  readonly importSessions: readonly BackupRow[];
  readonly importEntries: readonly BackupRow[];
  readonly attachments: readonly BackupAttachmentRecord[];
}

export interface BackupManifest {
  readonly format: "dailyflow-backup";
  readonly formatVersion: 1;
  readonly schemaVersion: number;
  readonly dataSchemaVersion: number;
  readonly appVersion: string;
  readonly createdAt: UtcTimestamp;
  readonly deviceId: EntityId;
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly attachmentCount: number;
  readonly rawImportFileCount: number;
  readonly totalBytes: number;
  readonly contentDigest: string;
}

export interface BackupArchiveFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface BackupArtifact {
  readonly filename: string;
  readonly mediaType: "application/zip";
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly manifest: BackupManifest;
  readonly files: readonly BackupArchiveFile[];
  readonly totalUncompressedBytes: number;
}

export interface InspectedBackup {
  readonly manifest: BackupManifest;
  readonly dataset: BackupDataset;
  readonly files: readonly BackupArchiveFile[];
}

export interface BuildBackupArchiveOptions {
  readonly dataset: BackupDataset;
  readonly fileName: string;
  readonly createdAt: UtcTimestamp;
  readonly deviceId: EntityId;
  readonly appVersion: string;
  readonly dataSchemaVersion: number;
}

export interface BackupArchiveLimits {
  readonly maxEntries: number;
  readonly maxFileUncompressedBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
}

export type BackupValidationErrorCode =
  | "ARCHIVE_INVALID"
  | "ARCHIVE_LIMIT_EXCEEDED"
  | "UNSAFE_ARCHIVE_PATH"
  | "DUPLICATE_ARCHIVE_PATH"
  | "ARCHIVE_ENTRY_MISSING"
  | "MANIFEST_INVALID"
  | "CHECKSUM_INVALID"
  | "SCHEMA_TOO_NEW"
  | "DUPLICATE_ENTITY_ID"
  | "DUPLICATE_JOURNAL_DATE"
  | "INVALID_JSON"
  | "INVALID_FOREIGN_KEY"
  | "ATTACHMENT_INVALID"
  | "ATTACHMENT_HASH_MISMATCH"
  | "RAW_IMPORT_INVALID"
  | "RAW_IMPORT_HASH_MISMATCH"
  | "UNSAFE_STORAGE_REFERENCE";

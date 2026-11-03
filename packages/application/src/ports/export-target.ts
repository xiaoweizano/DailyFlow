import type {
  AttachmentRef,
  EntityId,
  ImportEntry,
  ImportSession,
  Journal,
  KnowledgeItem,
  Task,
  UtcTimestamp,
} from "@dailyflow/domain";

import type { ContentProjector } from "./journal-repository.js";

export const EXPORT_SCOPES = ["all", "journals", "knowledge", "tasks", "imports"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export interface ExportOptions {
  readonly scope: ExportScope;
  readonly includeDeleted: boolean;
  readonly includeAttachments: boolean;
  readonly includeImportRawBytes: boolean;
}

export interface ExportArchiveOptions extends ExportOptions {
  readonly generatedAt: UtcTimestamp;
}

export interface ExportEstimate {
  readonly entityCount: number;
  readonly fileCount: number;
  readonly estimatedBytes: number;
}

export interface ExportJournalRecord {
  readonly journal: Journal;
  readonly tags: readonly string[];
}

export interface ExportKnowledgeRecord {
  readonly item: KnowledgeItem;
  readonly tags: readonly string[];
}

export interface ExportAttachmentRecord {
  readonly attachment: AttachmentRef;
  readonly bytes: Uint8Array;
}

export interface ExportImportSnapshot {
  readonly sessions: readonly ImportSession[];
  readonly entries: readonly ExportImportEntryRecord[];
}

export interface ExportImportEntryRecord {
  readonly sessionId: EntityId;
  readonly entry: ImportEntry;
}

export interface ExportDataset {
  readonly journals: readonly ExportJournalRecord[];
  readonly knowledge: readonly ExportKnowledgeRecord[];
  readonly tasks: readonly Task[];
  readonly attachments: readonly ExportAttachmentRecord[];
  readonly imports: ExportImportSnapshot;
}

export interface ExportFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ExportFileManifestEntry {
  readonly path: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface ExportManifest {
  readonly format: "dailyflow-export";
  readonly formatVersion: 1;
  readonly generatedAt: UtcTimestamp;
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly files: readonly ExportFileManifestEntry[];
}

export interface ExportArtifact {
  readonly filename: string;
  readonly mediaType: "application/zip";
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly fileCount: number;
  readonly entityCount: number;
  readonly totalUncompressedBytes: number;
}

export interface ExportSaveResult {
  readonly filename: string;
  readonly bytesWritten: number;
}

export interface ExportTarget {
  save(artifact: ExportArtifact): Promise<ExportSaveResult | null>;
}

export interface ExportSource {
  estimate(options: ExportOptions): Promise<ExportEstimate>;
  createArchive(
    options: ExportArchiveOptions,
    projector: ContentProjector,
  ): Promise<ExportArtifact>;
}

export interface ExportDataResult {
  readonly artifact: ExportArtifact;
  readonly saved: ExportSaveResult;
}

export type ExportDataOutcome =
  | {
      readonly status: "saved";
      readonly artifact: ExportArtifact;
      readonly saved: ExportSaveResult;
    }
  | {
      readonly status: "cancelled";
    };

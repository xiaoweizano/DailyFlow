import type {
  ContentDocument,
  EntityId,
  ImportConflictKind,
  ImportEncoding,
  ImportEntryStatus,
  ImportNewlineStyle,
  ImportSession,
  LocalDate,
  UtcTimestamp,
} from "@dailyflow/domain";
import type { ImportIssue } from "@dailyflow/shared";

export interface ImportRoot {
  readonly label: string;
  readonly handle: unknown;
}

export interface RawImportFile {
  readonly relativePath: string;
  readonly fileName: string;
  readonly rawBytes: Uint8Array | null;
  readonly byteSize: number | null;
  readonly lastModified: number | null;
  readonly readError: ImportIssue | null;
}

export interface ImportScanOptions {
  readonly signal?: AbortSignal;
}

export interface ImportSource {
  selectRoot(): Promise<ImportRoot | null>;
  scan(root: ImportRoot, options?: ImportScanOptions): AsyncIterable<RawImportFile>;
}

export interface ImportPreviewEntry {
  readonly entryId: EntityId;
  readonly relativePath: string;
  readonly fileName: string;
  readonly detectedDate: LocalDate | null;
  readonly encoding: ImportEncoding;
  readonly newlineStyle: ImportNewlineStyle;
  readonly rawCaptureStatus: "captured" | "cleaned" | "unavailable";
  readonly fileSha256: string | null;
  readonly byteSize: number | null;
  readonly excerpt: string;
  readonly status: "ready" | "skipped" | "conflict" | "invalid";
  readonly conflictKind: ImportConflictKind | null;
  readonly existingJournalId: EntityId | null;
  readonly existingRevision: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly issue: ImportIssue | null;
}

export interface ImportPreviewCounts {
  readonly scanned: number;
  readonly ready: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly invalid: number;
}

export interface ImportPreview {
  readonly session: Omit<ImportSession, "entries">;
  readonly entries: readonly ImportPreviewEntry[];
  readonly counts: ImportPreviewCounts;
  readonly estimatedBytes: number;
  readonly warnings: readonly ImportIssue[];
}

export type ImportConflictPolicy = "skip" | "new_version";

export interface CommitImportInput {
  readonly sessionId: EntityId;
  readonly expectedSessionRevision: number;
  readonly selectedPaths: readonly string[];
  readonly conflictPolicy?: ImportConflictPolicy;
  readonly committedAt: UtcTimestamp;
}

export interface ImportCommitResult {
  readonly sessionId: EntityId;
  readonly status: "completed" | "failed";
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
}

export interface ImportTxtAnalysis {
  readonly encoding: ImportEncoding;
  readonly text: string | null;
  readonly newlineStyle: ImportNewlineStyle;
}

export interface ImportTxtAnalyzer {
  analyze(bytes: Uint8Array): Promise<ImportTxtAnalysis>;
}

export interface TxtDocumentConverter {
  toContent(text: string): ContentDocument;
}

export interface ImportService {
  selectRoot(): Promise<ImportRoot | null>;
  scan(root: ImportRoot): Promise<AsyncIterable<RawImportFile>>;
  createPreview(
    root: ImportRoot,
    files: AsyncIterable<RawImportFile>,
  ): Promise<ImportPreview>;
  commit(input: CommitImportInput): Promise<ImportCommitResult>;
}

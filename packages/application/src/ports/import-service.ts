import type { EntityId, ImportSession, LocalDate, UtcTimestamp } from "@dailyflow/domain";
import type { ImportIssue } from "@dailyflow/shared";

export interface ImportRoot {
  readonly label: string;
  readonly handle: unknown;
}

export interface RawImportFile {
  readonly relativePath: string;
  readonly fileName: string;
  readonly rawBytes: Uint8Array;
  readonly detectedDate: LocalDate | null;
  readonly encoding: "utf-8" | "utf-8-bom" | "gbk" | "unknown";
}

export interface ImportPreviewEntry {
  readonly relativePath: string;
  readonly detectedDate: LocalDate | null;
  readonly status: "ready" | "skipped" | "conflict" | "invalid";
  readonly issue: ImportIssue | null;
}

export interface ImportPreview {
  readonly session: ImportSession;
  readonly entries: readonly ImportPreviewEntry[];
}

export interface CommitImportInput {
  readonly sessionId: EntityId;
  readonly expectedSessionRevision: number;
  readonly selectedPaths: readonly string[];
  readonly committedAt: UtcTimestamp;
}

export interface ImportCommitResult {
  readonly sessionId: EntityId;
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
}

export interface ImportService {
  scan(root: ImportRoot): Promise<AsyncIterable<RawImportFile>>;
  createPreview(files: AsyncIterable<RawImportFile>): Promise<ImportPreview>;
  commit(input: CommitImportInput): Promise<ImportCommitResult>;
}

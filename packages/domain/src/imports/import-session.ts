import type { DomainDependencies } from "../shared/ports.js";
import type { JsonObject } from "../shared/content.js";
import { DomainRuleError } from "../shared/errors.js";
import {
  nextEntityId,
  nowUtc,
  parseRevision,
  requireNonEmptyString,
  type EntityId,
  type LocalDate,
  type Revision,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const IMPORT_SESSION_STATUSES = [
  "scanning",
  "preview_ready",
  "committing",
  "completed",
  "failed",
  "rolled_back",
] as const;
export type ImportSessionStatus = (typeof IMPORT_SESSION_STATUSES)[number];

export const IMPORT_ENTRY_STATUSES = [
  "ready",
  "skipped",
  "conflict",
  "invalid",
  "imported",
  "failed",
] as const;
export type ImportEntryStatus = (typeof IMPORT_ENTRY_STATUSES)[number];

export const IMPORT_RAW_CAPTURE_STATUSES = ["captured", "cleaned", "unavailable"] as const;
export type ImportRawCaptureStatus = (typeof IMPORT_RAW_CAPTURE_STATUSES)[number];

export const IMPORT_ENCODINGS = ["utf8-bom", "utf8", "gb18030", "unknown"] as const;
export type ImportEncoding = (typeof IMPORT_ENCODINGS)[number];

export const IMPORT_NEWLINE_STYLES = ["lf", "crlf", "mixed", "unknown"] as const;
export type ImportNewlineStyle = (typeof IMPORT_NEWLINE_STYLES)[number];

export const IMPORT_CONFLICT_KINDS = [
  "duplicate_path",
  "duplicate_content",
  "same_date_conflict",
  "duplicate_date_in_batch",
] as const;
export type ImportConflictKind = (typeof IMPORT_CONFLICT_KINDS)[number];

export interface ImportEntry {
  readonly id: EntityId;
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
  readonly previousJournalRevision: Revision | null;
  readonly createdAt: UtcTimestamp;
  readonly committedAt: UtcTimestamp | null;
}

export interface ImportSession {
  readonly id: EntityId;
  readonly rootLabel: string;
  readonly status: ImportSessionStatus;
  readonly options: JsonObject;
  readonly revision: Revision;
  readonly scannedCount: number;
  readonly readyCount: number;
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly conflictCount: number;
  readonly invalidCount: number;
  readonly entries: readonly ImportEntry[];
  readonly createdAt: UtcTimestamp;
  readonly completedAt: UtcTimestamp | null;
  readonly errorSummary: string | null;
}

export interface CreateImportSessionInput {
  readonly rootLabel: string;
  readonly options?: JsonObject;
}

export function createImportSession(
  input: CreateImportSessionInput,
  dependencies: DomainDependencies,
): ImportSession {
  requireNonEmptyString(input.rootLabel, "rootLabel");
  if (
    input.options !== undefined &&
    (typeof input.options !== "object" || input.options === null || Array.isArray(input.options))
  ) {
    throw new DomainRuleError("options", "Import options must be a JSON object");
  }
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    rootLabel: input.rootLabel,
    status: "scanning",
    options: input.options ?? {},
    revision: parseRevision(1),
    scannedCount: 0,
    readyCount: 0,
    importedCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    invalidCount: 0,
    entries: [],
    createdAt,
    completedAt: null,
    errorSummary: null,
  };
}

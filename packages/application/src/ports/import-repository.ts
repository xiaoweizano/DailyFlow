import type {
  EntityId,
  ImportEntry,
  ImportSession,
  LocalDate,
  UtcTimestamp,
} from "@dailyflow/domain";

import type { SaveJournalSnapshot } from "./journal-repository.js";

export interface ImportExistingMatch {
  readonly relativePath: string | null;
  readonly detectedDate: LocalDate | null;
  readonly fileSha256: string | null;
  readonly journalId: EntityId | null;
  readonly journalRevision: number | null;
}

export interface ImportCommitEntry {
  readonly entryId: EntityId;
  readonly journalId: EntityId;
  readonly previousJournalRevision: number | null;
  readonly snapshot: SaveJournalSnapshot;
}

export interface BeginImportCommitInput {
  readonly sessionId: EntityId;
  readonly expectedRevision: number;
  readonly startedAt: UtcTimestamp;
}

export interface ImportCommitBatchInput {
  readonly sessionId: EntityId;
  readonly expectedRevision: number;
  readonly committedAt: UtcTimestamp;
  readonly entries: readonly ImportCommitEntry[];
  readonly skippedEntryIds: readonly EntityId[];
  readonly failedEntryIds: readonly EntityId[];
}

export interface ImportCommitSummary {
  readonly sessionId: EntityId;
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
}

export interface RecordImportFailureInput {
  readonly sessionId: EntityId;
  readonly expectedRevision: number;
  readonly failedAt: UtcTimestamp;
  readonly errorSummary: string;
  readonly failedEntryIds: readonly EntityId[];
}

export interface ImportRepository {
  createSession(session: ImportSession): Promise<void>;
  savePreview(session: ImportSession): Promise<void>;
  findExistingMatches(entries: readonly ImportEntry[]): Promise<readonly ImportExistingMatch[]>;
  beginCommit(input: BeginImportCommitInput): Promise<ImportSession>;
  commitBatch(input: ImportCommitBatchInput): Promise<ImportCommitSummary>;
  recordFailure(input: RecordImportFailureInput): Promise<void>;
}

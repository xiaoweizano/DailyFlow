import type {
  BeginImportCommitInput,
  ImportCommitBatchInput,
  ImportCommitEntry,
  ImportCommitSummary,
  ImportExistingMatch,
  ImportRepository,
  RecordImportFailureInput,
} from "@dailyflow/application";
import {
  parseRevision,
  type ImportEntry,
  type ImportSession,
} from "@dailyflow/domain";

import { toSaveSnapshotDto } from "./desktop-journal-repository.js";
import type { TauriCommandClient } from "./tauri-client.js";
import type {
  ImportCommitEntryDto,
  ImportEntryDto,
  ImportSessionDto,
} from "./tauri-contracts.js";

export interface DesktopImportRepositoryOptions {
  readonly client: TauriCommandClient;
}

export class DesktopImportRepository implements ImportRepository {
  private readonly client: TauriCommandClient;

  constructor(options: DesktopImportRepositoryOptions) {
    this.client = options.client;
  }

  async createSession(session: ImportSession): Promise<void> {
    await this.client.createImportSession(toImportSessionDto(session));
  }

  async savePreview(session: ImportSession): Promise<void> {
    await this.client.saveImportPreview(toImportSessionDto(session));
  }

  async findExistingMatches(
    entries: readonly ImportEntry[],
  ): Promise<readonly ImportExistingMatch[]> {
    const matches = await this.client.findImportExistingMatches(
      entries.map(toImportEntryDto),
    );
    return matches.map((match) => ({
      relativePath: match.relativePath,
      detectedDate: match.detectedDate,
      fileSha256: match.fileSha256,
      journalId: match.journalId,
      journalRevision: match.journalRevision,
    }));
  }

  async beginCommit(input: BeginImportCommitInput): Promise<ImportSession> {
    const session = await this.client.beginImportCommit({
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      startedAt: input.startedAt,
    });
    return toImportSession(session);
  }

  async commitBatch(input: ImportCommitBatchInput): Promise<ImportCommitSummary> {
    return this.client.commitImportBatch({
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      committedAt: input.committedAt,
      entries: input.entries.map(toImportCommitEntryDto),
      skippedEntryIds: [...input.skippedEntryIds],
      failedEntryIds: [...input.failedEntryIds],
    });
  }

  async recordFailure(input: RecordImportFailureInput): Promise<void> {
    await this.client.recordImportFailure({
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      failedAt: input.failedAt,
      errorSummary: input.errorSummary,
      failedEntryIds: [...input.failedEntryIds],
    });
  }
}

function toImportSessionDto(session: ImportSession): ImportSessionDto {
  return {
    id: session.id,
    rootLabel: session.rootLabel,
    status: session.status,
    options: session.options,
    revision: session.revision,
    scannedCount: session.scannedCount,
    readyCount: session.readyCount,
    importedCount: session.importedCount,
    skippedCount: session.skippedCount,
    conflictCount: session.conflictCount,
    invalidCount: session.invalidCount,
    entries: session.entries.map(toImportEntryDto),
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    errorSummary: session.errorSummary,
  };
}

function toImportEntryDto(entry: ImportEntry): ImportEntryDto {
  return {
    id: entry.id,
    relativePath: entry.relativePath,
    originalFileName: entry.originalFileName,
    detectedDate: entry.detectedDate,
    encoding: entry.encoding,
    newlineStyle: entry.newlineStyle,
    fileSha256: entry.fileSha256,
    rawSize: entry.rawSize,
    rawCaptureStatus: entry.rawCaptureStatus,
    rawBytesBase64:
      entry.rawBytes === null ? null : bytesToBase64(entry.rawBytes),
    rawCleanedAt: entry.rawCleanedAt,
    status: entry.status,
    conflictKind: entry.conflictKind,
    errorCode: entry.errorCode,
    errorDetail: entry.errorDetail,
    journalId: entry.journalId,
    previousJournalRevision: entry.previousJournalRevision,
    createdAt: entry.createdAt,
    committedAt: entry.committedAt,
  };
}

function toImportCommitEntryDto(entry: ImportCommitEntry): ImportCommitEntryDto {
  return {
    entryId: entry.entryId,
    journalId: entry.journalId,
    previousJournalRevision: entry.previousJournalRevision,
    snapshot: toSaveSnapshotDto(entry.snapshot),
  };
}

function toImportSession(dto: ImportSessionDto): ImportSession {
  return {
    id: dto.id,
    rootLabel: dto.rootLabel,
    status: dto.status,
    options: dto.options,
    revision: parseRevision(dto.revision),
    scannedCount: dto.scannedCount,
    readyCount: dto.readyCount,
    importedCount: dto.importedCount,
    skippedCount: dto.skippedCount,
    conflictCount: dto.conflictCount,
    invalidCount: dto.invalidCount,
    entries: dto.entries.map(toImportEntry),
    createdAt: dto.createdAt,
    completedAt: dto.completedAt,
    errorSummary: dto.errorSummary,
  };
}

function toImportEntry(dto: ImportEntryDto): ImportEntry {
  return {
    id: dto.id,
    relativePath: dto.relativePath,
    originalFileName: dto.originalFileName,
    detectedDate: dto.detectedDate,
    encoding: dto.encoding,
    newlineStyle: dto.newlineStyle,
    fileSha256: dto.fileSha256,
    rawSize: dto.rawSize,
    rawCaptureStatus: dto.rawCaptureStatus,
    rawBytes:
      dto.rawBytesBase64 === null
        ? null
        : base64ToBytes(dto.rawBytesBase64),
    rawCleanedAt: dto.rawCleanedAt,
    status: dto.status,
    conflictKind: dto.conflictKind,
    errorCode: dto.errorCode,
    errorDetail: dto.errorDetail,
    journalId: dto.journalId,
    previousJournalRevision:
      dto.previousJournalRevision === null
        ? null
        : parseRevision(dto.previousJournalRevision),
    createdAt: dto.createdAt,
    committedAt: dto.committedAt,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(
        ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
      ),
    );
  }
  return btoa(chunks.join(""));
}

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

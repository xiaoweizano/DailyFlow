import type {
  BeginImportCommitInput,
  ImportCommitBatchInput,
  ImportCommitSummary,
  ImportExistingMatch,
  ImportRepository,
  RecordImportFailureInput,
} from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import {
  parseRevision,
  type EntityId,
  type IdGenerator,
  type ImportEntry,
  type ImportSession,
  type JsonObject,
} from "@dailyflow/domain";
import { stableStringify } from "@dailyflow/shared";

import type { DailyFlowDb } from "./db.js";
import { saveJournalSnapshotInTransaction } from "./dexie-journal-repository.js";
import type { ImportEntryRow, ImportSessionRow } from "./schema.js";

export interface DexieImportRepositoryOptions {
  readonly database: DailyFlowDb;
  readonly ids: IdGenerator;
}

function conflict(
  entity: string,
  id: EntityId,
  expectedRevision: number,
  actualRevision: number,
): never {
  throw new PortError("CONFLICT", {
    message: `${entity} revision conflict`,
    entity,
    id,
    expectedRevision,
    actualRevision,
  });
}

function notFound(entity: string, id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: `${entity} not found`,
    entity,
    id,
  });
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toSessionRow(session: ImportSession): ImportSessionRow {
  return {
    id: session.id,
    rootLabel: session.rootLabel,
    status: session.status,
    optionsJson: stableStringify(session.options),
    revision: session.revision,
    scannedCount: session.scannedCount,
    readyCount: session.readyCount,
    importedCount: session.importedCount,
    skippedCount: session.skippedCount,
    conflictCount: session.conflictCount,
    invalidCount: session.invalidCount,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    errorSummary: session.errorSummary,
  };
}

function toEntryRow(sessionId: EntityId, entry: ImportEntry): ImportEntryRow {
  return {
    id: entry.id,
    sessionId,
    relativePath: entry.relativePath,
    originalFileName: entry.originalFileName,
    detectedDate: entry.detectedDate,
    encoding: entry.encoding,
    newlineStyle: entry.newlineStyle,
    fileSha256: entry.fileSha256,
    rawSize: entry.rawSize,
    rawCaptureStatus: entry.rawCaptureStatus,
    rawBytes: entry.rawBytes,
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

function toImportEntry(row: ImportEntryRow): ImportEntry {
  return {
    id: row.id,
    relativePath: row.relativePath,
    originalFileName: row.originalFileName,
    detectedDate: row.detectedDate,
    encoding: row.encoding,
    newlineStyle: row.newlineStyle,
    fileSha256: row.fileSha256,
    rawSize: row.rawSize,
    rawCaptureStatus: row.rawCaptureStatus,
    rawBytes: row.rawBytes,
    rawCleanedAt: row.rawCleanedAt,
    status: row.status,
    conflictKind: row.conflictKind,
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
    journalId: row.journalId,
    previousJournalRevision:
      row.previousJournalRevision === null
        ? null
        : parseRevision(row.previousJournalRevision),
    createdAt: row.createdAt,
    committedAt: row.committedAt,
  };
}

function toImportSession(
  row: ImportSessionRow,
  entries: readonly ImportEntryRow[],
): ImportSession {
  return {
    id: row.id,
    rootLabel: row.rootLabel,
    status: row.status,
    options: parseJson<JsonObject>(row.optionsJson),
    revision: parseRevision(row.revision),
    scannedCount: row.scannedCount,
    readyCount: row.readyCount,
    importedCount: row.importedCount,
    skippedCount: row.skippedCount,
    conflictCount: row.conflictCount,
    invalidCount: row.invalidCount,
    entries: entries.map(toImportEntry),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorSummary: row.errorSummary,
  };
}

function assertUniquePreviewEntries(entries: readonly ImportEntry[]): void {
  const ids = new Set<EntityId>();
  const paths = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new PortError("CONFLICT", {
        message: `Duplicate import entry: ${entry.id}`,
        entity: "import_entry",
        id: entry.id,
      });
    }
    if (paths.has(entry.relativePath)) {
      throw new PortError("CONFLICT", {
        message: `Duplicate import path: ${entry.relativePath}`,
        entity: "import_entry",
        id: entry.id,
      });
    }
    ids.add(entry.id);
    paths.add(entry.relativePath);
  }
}

export class DexieImportRepository implements ImportRepository {
  private readonly database: DailyFlowDb;
  private readonly ids: IdGenerator;

  constructor(options: DexieImportRepositoryOptions) {
    this.database = options.database;
    this.ids = options.ids;
  }

  async createSession(session: ImportSession): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.importSessions, this.database.importEntries],
      async () => {
        if ((await this.database.importSessions.get(session.id)) !== undefined) {
          throw new PortError("CONFLICT", {
            message: "Import session already exists",
            entity: "import_session",
            id: session.id,
          });
        }
        if (session.status !== "scanning" || session.entries.length > 0) {
          throw new PortError("VALIDATION_ERROR", {
            message: "A new import session must be empty and scanning",
          });
        }
        await this.database.importSessions.put(toSessionRow(session));
      },
    );
  }

  async savePreview(session: ImportSession): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.importSessions, this.database.importEntries],
      async () => {
        const current = await this.database.importSessions.get(session.id);
        if (current === undefined) {
          return notFound("import_session", session.id);
        }
        if (current.status !== "scanning" || current.revision !== session.revision - 1) {
          return conflict(
            "import_session",
            session.id,
            session.revision - 1,
            current.revision,
          );
        }
        if (session.status !== "preview_ready") {
          throw new PortError("VALIDATION_ERROR", {
            message: "Preview must persist a preview_ready session",
          });
        }

        assertUniquePreviewEntries(session.entries);
        await this.database.importEntries.where("sessionId").equals(session.id).delete();
        await this.database.importEntries.bulkPut(
          session.entries.map((entry) => toEntryRow(session.id, entry)),
        );
        await this.database.importSessions.put(toSessionRow(session));
      },
    );
  }

  async findExistingMatches(
    entries: readonly ImportEntry[],
  ): Promise<readonly ImportExistingMatch[]> {
    if (entries.length === 0) {
      return [];
    }

    const [importRows, journals] = await Promise.all([
      this.database.importEntries.toArray(),
      this.database.journals.toArray(),
    ]);
    const activeJournals = journals.filter(
      (journal) => journal.status === "active" && journal.deletedAt === null,
    );
    const journalsById = new Map(activeJournals.map((journal) => [journal.id, journal]));
    const matches: ImportExistingMatch[] = [];
    const matchedJournalIds = new Set<EntityId>();

    for (const row of importRows) {
      if (row.status !== "imported" || row.journalId === null) {
        continue;
      }
      const journal = journalsById.get(row.journalId);
      if (journal === undefined) {
        continue;
      }
      const relevant = entries.some(
        (entry) =>
          entry.relativePath === row.relativePath ||
          (entry.fileSha256 !== null && entry.fileSha256 === row.fileSha256) ||
          (entry.detectedDate !== null && entry.detectedDate === row.detectedDate),
      );
      if (!relevant) {
        continue;
      }

      matches.push({
        relativePath: row.relativePath,
        detectedDate: row.detectedDate,
        fileSha256: row.fileSha256,
        journalId: row.journalId,
        journalRevision: journal.revision,
      });
      matchedJournalIds.add(row.journalId);
    }

    const candidateDates = new Set(
      entries.flatMap((entry) => (entry.detectedDate === null ? [] : [entry.detectedDate])),
    );
    for (const journal of activeJournals) {
      if (candidateDates.has(journal.journalDate) && !matchedJournalIds.has(journal.id)) {
        matches.push({
          relativePath: null,
          detectedDate: journal.journalDate,
          fileSha256: null,
          journalId: journal.id,
          journalRevision: journal.revision,
        });
      }
    }

    return matches;
  }

  async beginCommit(input: BeginImportCommitInput): Promise<ImportSession> {
    return this.database.transaction(
      "rw",
      [this.database.importSessions, this.database.importEntries],
      async () => {
        const current = await this.database.importSessions.get(input.sessionId);
        if (current === undefined) {
          return notFound("import_session", input.sessionId);
        }
        if (
          current.status !== "preview_ready" ||
          current.revision !== input.expectedRevision
        ) {
          return conflict(
            "import_session",
            input.sessionId,
            input.expectedRevision,
            current.revision,
          );
        }

        const committing: ImportSessionRow = {
          ...current,
          status: "committing",
          revision: current.revision + 1,
        };
        await this.database.importSessions.put(committing);
        const entries = await this.database.importEntries
          .where("sessionId")
          .equals(input.sessionId)
          .toArray();
        return toImportSession(committing, entries);
      },
    );
  }

  async commitBatch(input: ImportCommitBatchInput): Promise<ImportCommitSummary> {
    return this.database.transaction(
      "rw",
      [
        this.database.importSessions,
        this.database.importEntries,
        this.database.journals,
        this.database.journalVersions,
        this.database.structuredBlocks,
        this.database.journalTags,
        this.database.tags,
        this.database.searchDocs,
        this.database.searchTermPostings,
      ],
      async () => {
        const session = await this.database.importSessions.get(input.sessionId);
        if (session === undefined) {
          return notFound("import_session", input.sessionId);
        }
        if (session.status !== "committing" || session.revision !== input.expectedRevision) {
          return conflict(
            "import_session",
            input.sessionId,
            input.expectedRevision,
            session.revision,
          );
        }

        const selectedIds = new Set([
          ...input.entries.map((entry) => entry.entryId),
          ...input.skippedEntryIds,
          ...input.failedEntryIds,
        ]);
        if (
          selectedIds.size !==
          input.entries.length +
            input.skippedEntryIds.length +
            input.failedEntryIds.length
        ) {
          throw new PortError("VALIDATION_ERROR", {
            message: "An import entry cannot be selected for multiple outcomes",
          });
        }

        for (const entry of input.entries) {
          const row = await this.database.importEntries.get(entry.entryId);
          if (row === undefined || row.sessionId !== input.sessionId) {
            return notFound("import_entry", entry.entryId);
          }
          if (row.status === "imported" || row.status === "failed") {
            return conflict(
              "import_entry",
              entry.entryId,
              input.expectedRevision,
              session.revision,
            );
          }

          await saveJournalSnapshotInTransaction(
            this.database,
            entry.snapshot,
            this.ids,
          );
          await this.database.importEntries.put({
            ...row,
            status: "imported",
            journalId: entry.journalId,
            previousJournalRevision: entry.previousJournalRevision,
            committedAt: input.committedAt,
            errorCode: null,
            errorDetail: null,
          });
        }

        for (const entryId of input.skippedEntryIds) {
          const row = await this.database.importEntries.get(entryId);
          if (row === undefined || row.sessionId !== input.sessionId) {
            return notFound("import_entry", entryId);
          }
          await this.database.importEntries.put({
            ...row,
            status: "skipped",
            committedAt: input.committedAt,
          });
        }

        for (const entryId of input.failedEntryIds) {
          const row = await this.database.importEntries.get(entryId);
          if (row === undefined || row.sessionId !== input.sessionId) {
            return notFound("import_entry", entryId);
          }
          await this.database.importEntries.put({
            ...row,
            status: "failed",
            committedAt: input.committedAt,
            errorCode: "IMPORT_ENTRY_FAILED",
            errorDetail: "The import entry could not be committed",
          });
        }

        await this.database.importSessions.put({
          ...session,
          status: "completed",
          revision: session.revision + 1,
          importedCount: input.entries.length,
          skippedCount: input.skippedEntryIds.length,
          completedAt: input.committedAt,
          errorSummary: null,
        });

        return {
          sessionId: input.sessionId,
          importedCount: input.entries.length,
          skippedCount: input.skippedEntryIds.length,
          failedCount: input.failedEntryIds.length,
        };
      },
    );
  }

  async recordFailure(input: RecordImportFailureInput): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.importSessions, this.database.importEntries],
      async () => {
        const session = await this.database.importSessions.get(input.sessionId);
        if (session === undefined) {
          return notFound("import_session", input.sessionId);
        }
        if (session.status === "completed") {
          throw new PortError("CONFLICT", {
            message: "A completed import cannot be converted into a failure",
            entity: "import_session",
            id: input.sessionId,
          });
        }
        if (session.revision !== input.expectedRevision) {
          return conflict(
            "import_session",
            input.sessionId,
            input.expectedRevision,
            session.revision,
          );
        }

        for (const entryId of input.failedEntryIds) {
          const row = await this.database.importEntries.get(entryId);
          if (row === undefined || row.sessionId !== input.sessionId) {
            return notFound("import_entry", entryId);
          }
          await this.database.importEntries.put({
            ...row,
            status: "failed",
            committedAt: input.failedAt,
            errorCode: "IMPORT_COMMIT_FAILED",
            errorDetail: input.errorSummary,
          });
        }
        await this.database.importSessions.put({
          ...session,
          status: "failed",
          revision: session.revision + 1,
          completedAt: input.failedAt,
          errorSummary: input.errorSummary,
        });
      },
    );
  }
}

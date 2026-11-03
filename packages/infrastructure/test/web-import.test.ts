import "fake-indexeddb/auto";

import { PortError } from "@dailyflow/application";
import {
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type ImportEntry,
  type ImportSession,
} from "@dailyflow/domain";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { DexieImportRepository } from "../src/web/dexie-import-repository.js";
import {
  makeJournalSnapshot,
  SequenceIdGenerator,
} from "../src/testing/repository-contract.js";

const SESSION_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c41");
const ENTRY_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c42");
const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c43");
const CREATED_AT = parseUtcTimestamp("2026-10-30T03:20:11.123Z");
const COMMITTED_AT = parseUtcTimestamp("2026-10-30T04:20:11.123Z");

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-import-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

function createEntry(overrides: Partial<ImportEntry> = {}): ImportEntry {
  return {
    id: ENTRY_ID,
    relativePath: "202610/20261030.txt",
    originalFileName: "20261030.txt",
    detectedDate: parseLocalDate("2026-10-30"),
    encoding: "utf8",
    newlineStyle: "lf",
    fileSha256: "a".repeat(64),
    rawSize: 12,
    rawCaptureStatus: "captured",
    rawBytes: new TextEncoder().encode("imported txt"),
    rawCleanedAt: null,
    status: "ready",
    conflictKind: null,
    errorCode: null,
    errorDetail: null,
    journalId: null,
    previousJournalRevision: null,
    createdAt: CREATED_AT,
    committedAt: null,
    ...overrides,
  };
}

function createScanningSession(): ImportSession {
  return {
    id: SESSION_ID,
    rootLabel: "work-logs",
    status: "scanning",
    options: { source: "txt" },
    revision: parseRevision(1),
    scannedCount: 0,
    readyCount: 0,
    importedCount: 0,
    skippedCount: 0,
    conflictCount: 0,
    invalidCount: 0,
    entries: [],
    createdAt: CREATED_AT,
    completedAt: null,
    errorSummary: null,
  };
}

function createPreviewSession(entries: readonly ImportEntry[] = [createEntry()]): ImportSession {
  return {
    ...createScanningSession(),
    status: "preview_ready",
    revision: parseRevision(2),
    scannedCount: entries.length,
    readyCount: entries.filter((entry) => entry.status === "ready").length,
    conflictCount: entries.filter((entry) => entry.status === "conflict").length,
    invalidCount: entries.filter((entry) => entry.status === "invalid").length,
    entries,
  };
}

function createHarness() {
  const database = createDatabase();
  return {
    database,
    repository: new DexieImportRepository({
      database,
      ids: new SequenceIdGenerator(),
    }),
  };
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describe("Dexie ImportRepository", () => {
  it("persists scanning sessions and atomically replaces preview entries", async () => {
    const { database, repository } = createHarness();
    await repository.createSession(createScanningSession());
    await repository.savePreview(createPreviewSession());

    await expect(database.importSessions.get(SESSION_ID)).resolves.toMatchObject({
      status: "preview_ready",
      revision: 2,
      scannedCount: 1,
      readyCount: 1,
    });
    await expect(database.importEntries.get(ENTRY_ID)).resolves.toMatchObject({
      sessionId: SESSION_ID,
      relativePath: "202610/20261030.txt",
      rawCaptureStatus: "captured",
      status: "ready",
    });
    const row = await database.importEntries.get(ENTRY_ID);
    expect(row?.rawBytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(row?.rawBytes ?? new Uint8Array())).toBe("imported txt");
  });

  it("rejects a stale preview transition without writing partial preview rows", async () => {
    const { database, repository } = createHarness();
    await repository.createSession(createScanningSession());
    await repository.savePreview(createPreviewSession());

    const stale = {
      ...createPreviewSession([createEntry({ id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c44") })]),
      revision: parseRevision(2),
    };
    const error = await repository.savePreview(stale).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect((error as PortError).code).toBe("CONFLICT");
    await expect(database.importEntries.count()).resolves.toBe(1);
  });

  it("moves a preview through committing and completed with all formal projections", async () => {
    const { database, repository } = createHarness();
    await repository.createSession(createScanningSession());
    await repository.savePreview(createPreviewSession());

    const committing = await repository.beginCommit({
      sessionId: SESSION_ID,
      expectedRevision: 2,
      startedAt: COMMITTED_AT,
    });
    expect(committing).toMatchObject({ status: "committing", revision: 3 });

    const result = await repository.commitBatch({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      committedAt: COMMITTED_AT,
      entries: [
        {
          entryId: ENTRY_ID,
          journalId: JOURNAL_ID,
          previousJournalRevision: null,
          snapshot: makeJournalSnapshot({
            journalId: JOURNAL_ID,
            journalDate: parseLocalDate("2026-10-30"),
            title: "20261030",
            bodyText: "imported txt",
            expectedRevision: null,
            checkpoint: "import",
            savedAt: COMMITTED_AT,
          }),
        },
      ],
      skippedEntryIds: [],
      failedEntryIds: [],
    });

    expect(result).toEqual({
      sessionId: SESSION_ID,
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    await expect(database.importSessions.get(SESSION_ID)).resolves.toMatchObject({
      status: "completed",
      revision: 4,
      importedCount: 1,
      completedAt: COMMITTED_AT,
    });
    await expect(database.importEntries.get(ENTRY_ID)).resolves.toMatchObject({
      status: "imported",
      journalId: JOURNAL_ID,
      committedAt: COMMITTED_AT,
    });
    await expect(database.journals.get(JOURNAL_ID)).resolves.toMatchObject({
      title: "20261030",
      revision: 1,
    });
    await expect(
      database.journalVersions.where("journalId").equals(JOURNAL_ID).count(),
    ).resolves.toBe(1);
    await expect(
      database.structuredBlocks.where("journalId").equals(JOURNAL_ID).count(),
    ).resolves.toBe(0);
    await expect(
      database.journalTags.where("journalId").equals(JOURNAL_ID).count(),
    ).resolves.toBe(1);
    await expect(
      database.searchDocs.where("ownerEntityId").equals(JOURNAL_ID).count(),
    ).resolves.toBe(1);
    await expect(
      database.searchTermPostings.where("docId").equals(JOURNAL_ID).count(),
    ).resolves.toBeGreaterThan(0);
  });

  it("rolls formal data back but records the failed audit in a separate transaction", async () => {
    const { database, repository } = createHarness();
    await repository.createSession(createScanningSession());
    await repository.savePreview(createPreviewSession());
    await repository.beginCommit({
      sessionId: SESSION_ID,
      expectedRevision: 2,
      startedAt: COMMITTED_AT,
    });

    const snapshot = makeJournalSnapshot({
      journalId: JOURNAL_ID,
      journalDate: parseLocalDate("2026-10-30"),
      expectedRevision: null,
      checkpoint: "import",
      savedAt: COMMITTED_AT,
    });
    const duplicateDocument = snapshot.searchDocuments[0]!;
    const error = await repository
      .commitBatch({
        sessionId: SESSION_ID,
        expectedRevision: 3,
        committedAt: COMMITTED_AT,
        entries: [
          {
            entryId: ENTRY_ID,
            journalId: JOURNAL_ID,
            previousJournalRevision: null,
            snapshot: {
              ...snapshot,
              searchDocuments: [duplicateDocument, duplicateDocument],
            },
          },
        ],
        skippedEntryIds: [],
        failedEntryIds: [],
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    await expect(database.journals.count()).resolves.toBe(0);
    await expect(database.journalVersions.count()).resolves.toBe(0);
    await expect(database.importSessions.get(SESSION_ID)).resolves.toMatchObject({
      status: "committing",
      revision: 3,
    });
    await expect(database.importEntries.get(ENTRY_ID)).resolves.toMatchObject({
      status: "ready",
      journalId: null,
    });

    await repository.recordFailure({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      failedAt: COMMITTED_AT,
      errorSummary: "duplicate search document",
      failedEntryIds: [ENTRY_ID],
    });

    await expect(database.importSessions.get(SESSION_ID)).resolves.toMatchObject({
      status: "failed",
      revision: 4,
      errorSummary: "duplicate search document",
      completedAt: COMMITTED_AT,
    });
    await expect(database.importEntries.get(ENTRY_ID)).resolves.toMatchObject({
      status: "failed",
      errorCode: "IMPORT_COMMIT_FAILED",
      errorDetail: "duplicate search document",
      committedAt: COMMITTED_AT,
    });
  });

  it("finds path, content, and date matches from completed imports and active journals", async () => {
    const { repository } = createHarness();
    await repository.createSession(createScanningSession());
    await repository.savePreview(createPreviewSession());
    await repository.beginCommit({
      sessionId: SESSION_ID,
      expectedRevision: 2,
      startedAt: COMMITTED_AT,
    });
    await repository.commitBatch({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      committedAt: COMMITTED_AT,
      entries: [
        {
          entryId: ENTRY_ID,
          journalId: JOURNAL_ID,
          previousJournalRevision: null,
          snapshot: makeJournalSnapshot({
            journalId: JOURNAL_ID,
            journalDate: parseLocalDate("2026-10-30"),
            expectedRevision: null,
            checkpoint: "import",
            savedAt: COMMITTED_AT,
          }),
        },
      ],
      skippedEntryIds: [],
      failedEntryIds: [],
    });

    const matches = await repository.findExistingMatches([
      createEntry(),
      createEntry({ id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c45") }),
    ]);

    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: "202610/20261030.txt",
          detectedDate: "2026-10-30",
          fileSha256: "a".repeat(64),
          journalId: JOURNAL_ID,
          journalRevision: 1,
        }),
      ]),
    );
    expect(new Set(matches.map((match) => match.journalId))).toEqual(new Set([JOURNAL_ID]));
  });
});

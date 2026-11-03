import { PortError } from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type ImportSession,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopImportRepository } from "../src/desktop/desktop-import-repository.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

const SESSION_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d01");
const ENTRY_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d02");
const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d03");
const CREATED_AT = parseUtcTimestamp("2026-10-30T03:20:11.123Z");
const COMMITTED_AT = parseUtcTimestamp("2026-10-30T04:20:11.123Z");
const RAW_BYTES = new TextEncoder().encode("2026-10-30 imported text");

function createInvoke(result: unknown): ReturnType<typeof vi.fn<TauriInvoke>> {
  return vi.fn<TauriInvoke>().mockResolvedValue(result);
}

function createSession(overrides: Partial<ImportSession> = {}): ImportSession {
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
    ...overrides,
  };
}

function createPreviewSession(): ImportSession {
  return createSession({
    status: "preview_ready",
    revision: parseRevision(2),
    scannedCount: 1,
    readyCount: 1,
    entries: [
      {
        id: ENTRY_ID,
        relativePath: "202610/20261030.txt",
        originalFileName: "20261030.txt",
        detectedDate: parseLocalDate("2026-10-30"),
        encoding: "utf8",
        newlineStyle: "lf",
        fileSha256: "a".repeat(64),
        rawSize: RAW_BYTES.byteLength,
        rawCaptureStatus: "captured",
        rawBytes: RAW_BYTES,
        rawCleanedAt: null,
        status: "ready",
        conflictKind: null,
        errorCode: null,
        errorDetail: null,
        journalId: null,
        previousJournalRevision: null,
        createdAt: CREATED_AT,
        committedAt: null,
      },
    ],
  });
}

function sessionDto(status: "scanning" | "preview_ready" | "committing") {
  const session = createPreviewSession();
  return {
    id: session.id,
    rootLabel: session.rootLabel,
    status,
    options: session.options,
    revision: session.revision,
    scannedCount: session.scannedCount,
    readyCount: session.readyCount,
    importedCount: session.importedCount,
    skippedCount: session.skippedCount,
    conflictCount: session.conflictCount,
    invalidCount: session.invalidCount,
    entries: session.entries.map(({ rawBytes, ...entry }) => ({
      ...entry,
      rawBytesBase64:
        rawBytes === null ? null : Buffer.from(rawBytes).toString("base64"),
    })),
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    errorSummary: session.errorSummary,
  };
}

function createRepository(invoke: TauriInvoke): DesktopImportRepository {
  return new DesktopImportRepository({
    client: new TauriCommandClient(invoke),
  });
}

describe("Desktop ImportRepository", () => {
  it("creates an empty scanning session", async () => {
    const invoke = createInvoke(null);
    const repository = createRepository(invoke);

    await repository.createSession(createSession());

    expect(invoke).toHaveBeenCalledWith("import_create_session", {
      input: expect.objectContaining({
        id: SESSION_ID,
        status: "scanning",
        revision: 1,
        entries: [],
      }),
    });
  });

  it("sends captured preview bytes to Rust as base64", async () => {
    const invoke = createInvoke(null);
    const repository = createRepository(invoke);

    await repository.savePreview(createPreviewSession());

    expect(invoke).toHaveBeenCalledWith("import_save_preview", {
      input: expect.objectContaining({
        id: SESSION_ID,
        revision: 2,
        entries: [
          expect.objectContaining({
            id: ENTRY_ID,
            rawBytesBase64: Buffer.from(RAW_BYTES).toString("base64"),
          }),
        ],
      }),
    });
  });

  it("maps the committing session and restores raw bytes from base64", async () => {
    const invoke = createInvoke(sessionDto("committing"));
    const repository = createRepository(invoke);

    const session = await repository.beginCommit({
      sessionId: SESSION_ID,
      expectedRevision: 2,
      startedAt: COMMITTED_AT,
    });

    expect(invoke).toHaveBeenCalledWith("import_begin_commit", {
      input: {
        sessionId: SESSION_ID,
        expectedRevision: 2,
        startedAt: COMMITTED_AT,
      },
    });
    expect(session.status).toBe("committing");
    expect(session.entries[0]?.rawBytes).toEqual(RAW_BYTES);
  });

  it("maps a batch commit and validates the returned summary", async () => {
    const invoke = createInvoke({
      sessionId: SESSION_ID,
      importedCount: 1,
      skippedCount: 2,
      failedCount: 0,
    });
    const repository = createRepository(invoke);

    const summary = await repository.commitBatch({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      committedAt: COMMITTED_AT,
      entries: [
        {
          entryId: ENTRY_ID,
          journalId: JOURNAL_ID,
          previousJournalRevision: null,
          snapshot: {
            journalId: JOURNAL_ID,
            journalDate: parseLocalDate("2026-10-30"),
            timezone: "Asia/Shanghai",
            title: "Imported log",
            contentJson: { type: "doc", content: [] },
            editorSchemaVersion: 1,
            contentMarkdown: "Imported text",
            contentPlainText: "Imported text",
            contentHash: parseContentHash("b".repeat(64)),
            projectionVersion: 1,
            excerpt: "Imported text",
            expectedRevision: null,
            checkpoint: "import",
            tags: [],
            structuredBlocks: [],
            searchDocuments: [],
            savedAt: COMMITTED_AT,
          },
        },
      ],
      skippedEntryIds: [ENTRY_ID],
      failedEntryIds: [],
    });

    expect(invoke).toHaveBeenCalledWith("import_commit_batch", {
      input: expect.objectContaining({
        sessionId: SESSION_ID,
        expectedRevision: 3,
        entries: [
          expect.objectContaining({
            entryId: ENTRY_ID,
            journalId: JOURNAL_ID,
            snapshot: expect.objectContaining({
              journalId: JOURNAL_ID,
              checkpoint: "import",
            }),
          }),
        ],
        skippedEntryIds: [ENTRY_ID],
      }),
    });
    expect(summary.importedCount).toBe(1);
  });

  it("maps existing journal matches from Rust", async () => {
    const invoke = createInvoke([
      {
        relativePath: "202610/20261030.txt",
        detectedDate: "2026-10-30",
        fileSha256: "a".repeat(64),
        journalId: JOURNAL_ID,
        journalRevision: 2,
      },
    ]);
    const repository = createRepository(invoke);
    const preview = createPreviewSession();

    const matches = await repository.findExistingMatches(preview.entries);

    expect(invoke).toHaveBeenCalledWith("import_find_existing_matches", {
      entries: [
        expect.objectContaining({
          id: ENTRY_ID,
          rawBytesBase64: Buffer.from(RAW_BYTES).toString("base64"),
        }),
      ],
    });
    expect(matches).toEqual([
      {
        relativePath: "202610/20261030.txt",
        detectedDate: parseLocalDate("2026-10-30"),
        fileSha256: "a".repeat(64),
        journalId: JOURNAL_ID,
        journalRevision: 2,
      },
    ]);
  });

  it("records a failed import with the current session revision", async () => {
    const invoke = createInvoke(null);
    const repository = createRepository(invoke);

    await repository.recordFailure({
      sessionId: SESSION_ID,
      expectedRevision: 3,
      failedAt: COMMITTED_AT,
      errorSummary: "Batch failed",
      failedEntryIds: [ENTRY_ID],
    });

    expect(invoke).toHaveBeenCalledWith("import_record_failure", {
      input: {
        sessionId: SESSION_ID,
        expectedRevision: 3,
        failedAt: COMMITTED_AT,
        errorSummary: "Batch failed",
        failedEntryIds: [ENTRY_ID],
      },
    });
  });

  it("rejects an invalid Rust session response before exposing it", async () => {
    const invoke = createInvoke({
      ...sessionDto("committing"),
      entries: undefined,
    });
    const repository = createRepository(invoke);

    const error = await repository
      .beginCommit({
        sessionId: SESSION_ID,
        expectedRevision: 2,
        startedAt: COMMITTED_AT,
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        fields: {
          entries: expect.any(String),
        },
      },
    });
  });
});

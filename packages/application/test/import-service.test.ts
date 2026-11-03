import {
  createContentDocument,
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type ContentDocument,
  type EntityId,
  type ImportSession,
  type LocalDate,
} from "@dailyflow/domain";
import { describe, expect, it } from "vitest";

import {
  TxtImportService,
  type ImportCommitBatchInput,
  type ImportCommitSummary,
  type ImportExistingMatch,
  type ImportRepository,
  type ImportRoot,
  type ImportTxtAnalysis,
  type ImportTxtAnalyzer,
  type RawImportFile,
  type TxtDocumentConverter,
} from "../src/index.js";

import {
  FakeProjector,
  JOURNAL_ID,
  SequenceIds,
  clock,
} from "./support.js";

const SESSION_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c31";
const ENTRY_ONE_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c32";
const ENTRY_TWO_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c33";
const NEW_JOURNAL_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c34";

class FakeAnalyzer implements ImportTxtAnalyzer {
  async analyze(bytes: Uint8Array): Promise<ImportTxtAnalysis> {
    return {
      encoding: "utf8",
      text: new TextDecoder().decode(bytes),
      newlineStyle: "lf",
    };
  }
}

class PlainTextConverter implements TxtDocumentConverter {
  toContent(text: string): ContentDocument {
    return createContentDocument(1, {
      type: "doc",
      content: text.split("\n").map((line) => ({
        type: "paragraph",
        ...(line.length === 0
          ? {}
          : { content: [{ type: "text", text: line }] }),
      })),
    });
  }
}

class FakeImportRepository implements ImportRepository {
  createSessionError: unknown = null;
  beginCommitError: unknown = null;
  commitError: unknown = null;
  session: ImportSession | null = null;
  existingMatches: readonly ImportExistingMatch[] = [];
  readonly failureRecords: Array<{
    sessionId: EntityId;
    expectedRevision: number;
    errorSummary: string;
    failedEntryIds: readonly EntityId[];
  }> = [];
  commitInput: ImportCommitBatchInput | null = null;

  async createSession(session: ImportSession): Promise<void> {
    if (this.createSessionError !== null) {
      throw this.createSessionError;
    }
    this.session = session;
  }

  async savePreview(session: ImportSession): Promise<void> {
    this.session = session;
  }

  async findExistingMatches(): Promise<readonly ImportExistingMatch[]> {
    return this.existingMatches;
  }

  async beginCommit(): Promise<ImportSession> {
    if (this.beginCommitError !== null) {
      throw this.beginCommitError;
    }
    if (this.session === null) {
      throw new Error("No preview session");
    }
    this.session = {
      ...this.session,
      status: "committing",
      revision: parseRevision(this.session.revision + 1),
    };
    return this.session;
  }

  async commitBatch(input: ImportCommitBatchInput): Promise<ImportCommitSummary> {
    if (this.commitError !== null) {
      throw this.commitError;
    }
    this.commitInput = input;
    return {
      sessionId: input.sessionId,
      importedCount: input.entries.length,
      skippedCount: input.skippedEntryIds.length,
      failedCount: 0,
    };
  }

  async recordFailure(input: {
    readonly sessionId: EntityId;
    readonly expectedRevision: number;
    readonly errorSummary: string;
    readonly failedEntryIds: readonly EntityId[];
  }): Promise<void> {
    this.failureRecords.push(input);
  }
}

function file(relativePath: string, text: string): RawImportFile {
  const rawBytes = new TextEncoder().encode(text);
  return {
    relativePath,
    fileName: relativePath.split("/").at(-1) ?? relativePath,
    rawBytes,
    byteSize: rawBytes.byteLength,
    lastModified: 1,
    readError: null,
  };
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function* files(...items: readonly RawImportFile[]): AsyncIterable<RawImportFile> {
  yield* items;
}

function createService(
  repository: FakeImportRepository,
  analyzer: ImportTxtAnalyzer = new FakeAnalyzer(),
  projector = new FakeProjector(),
): TxtImportService {
  return new TxtImportService({
    source: {
      async selectRoot() {
        return null;
      },
      async *scan() {},
    },
    repository,
    analyzer,
    converter: new PlainTextConverter(),
    projector,
    clock,
    ids: new SequenceIds([SESSION_ID, ENTRY_ONE_ID, ENTRY_TWO_ID, NEW_JOURNAL_ID]),
    timezone: () => "Asia/Shanghai",
  });
}

const root: ImportRoot = { label: "work-logs", handle: {} };

describe("TXT import preview", () => {
  it("persists the selected root label and a ready entry without exposing raw bytes", async () => {
    const repository = new FakeImportRepository();
    const service = createService(repository);

    const preview = await service.createPreview(
      root,
      files(file("202504/20250401.txt", "first line\nsecond line")),
    );

    expect(repository.session).toMatchObject({
      rootLabel: "work-logs",
      status: "preview_ready",
      revision: 2,
      scannedCount: 1,
      readyCount: 1,
    });
    expect(preview.entries[0]).toMatchObject({
      relativePath: "202504/20250401.txt",
      detectedDate: "2025-04-01",
      status: "ready",
      encoding: "utf8",
      rawCaptureStatus: "captured",
      excerpt: "first line\nsecond line",
    });
    expect(preview.entries[0]?.fileSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect("rawBytes" in (preview.entries[0] ?? {})).toBe(false);
  });

  it("marks read failures unavailable without inventing a hash and marks unknown encodings invalid", async () => {
    const repository = new FakeImportRepository();
    const analyzer: ImportTxtAnalyzer = {
      async analyze(bytes) {
        return new TextDecoder().decode(bytes).startsWith("unknown")
          ? { encoding: "unknown", text: null, newlineStyle: "unknown" }
          : { encoding: "utf8", text: "ok", newlineStyle: "lf" };
      },
    };
    const service = createService(repository, analyzer);
    const unreadable: RawImportFile = {
      relativePath: "202504/20250402.txt",
      fileName: "20250402.txt",
      rawBytes: null,
      byteSize: 12,
      lastModified: 1,
      readError: {
        code: "FILE_READ_FAILED",
        message: "permission denied",
        retryable: true,
      },
    };

    const preview = await service.createPreview(
      root,
      files(unreadable, file("202504/20250403.txt", "unknown")),
    );

    expect(preview.entries[0]).toMatchObject({
      status: "invalid",
      rawCaptureStatus: "unavailable",
      fileSha256: null,
      errorCode: "FILE_READ_FAILED",
      errorMessage: "permission denied",
    });
    expect(preview.entries[1]).toMatchObject({
      status: "invalid",
      encoding: "unknown",
      errorCode: "ENCODING_UNRESOLVED",
    });
  });

  it("classifies existing path, existing content and same-date conflicts", async () => {
    const repository = new FakeImportRepository();
    const service = createService(repository);
    repository.existingMatches = [
      {
        relativePath: "202504/20250401.txt",
        detectedDate: null,
        fileSha256: parseContentHash(await hash("path duplicate")),
        journalId: parseEntityId(JOURNAL_ID),
        journalRevision: 3,
      },
      {
        relativePath: null,
        detectedDate: parseLocalDate("2025-04-02"),
        fileSha256: parseContentHash(await hash("content duplicate")),
        journalId: parseEntityId(JOURNAL_ID),
        journalRevision: 3,
      },
      {
        relativePath: null,
        detectedDate: parseLocalDate("2025-04-03"),
        fileSha256: null,
        journalId: parseEntityId(JOURNAL_ID),
        journalRevision: 3,
      },
    ];

    const preview = await service.createPreview(
      root,
      files(
        file("202504/20250401.txt", "path duplicate"),
        file("202504/20250402.txt", "content duplicate"),
        file("202504/20250403.txt", "different content"),
      ),
    );

    expect(preview.entries.map((entry) => entry.status)).toEqual([
      "skipped",
      "skipped",
      "conflict",
    ]);
    expect(preview.entries.map((entry) => entry.conflictKind)).toEqual([
      "duplicate_path",
      "duplicate_content",
      "same_date_conflict",
    ]);
  });

  it("marks multiple files detected for one date as a batch conflict", async () => {
    const repository = new FakeImportRepository();
    const service = createService(repository);

    const preview = await service.createPreview(
      root,
      files(
        file("202504/01 morning.txt", "morning"),
        file("202504/01 evening.txt", "evening"),
      ),
    );

    expect(preview.entries.map((entry) => entry.status)).toEqual([
      "conflict",
      "conflict",
    ]);
    expect(preview.entries.map((entry) => entry.conflictKind)).toEqual([
      "duplicate_date_in_batch",
      "duplicate_date_in_batch",
    ]);
  });
});

describe("TXT import commit", () => {
  it("records a begin failure against the unchanged preview revision", async () => {
    const repository = new FakeImportRepository();
    const service = createService(repository);
    const preview = await service.createPreview(
      root,
      files(file("202504/20250401.txt", "will not begin")),
    );
    repository.beginCommitError = new Error("database locked");

    const result = await service.commit({
      sessionId: preview.session.id,
      expectedSessionRevision: preview.session.revision,
      selectedPaths: ["202504/20250401.txt"],
      conflictPolicy: "skip",
      committedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
    });

    expect(result).toMatchObject({
      importedCount: 0,
      failedCount: 1,
      status: "failed",
    });
    expect(repository.failureRecords).toHaveLength(1);
    expect(repository.failureRecords[0]).toMatchObject({
      expectedRevision: preview.session.revision,
      errorSummary: "database locked",
    });
  });

  it("passes complete projected snapshots and marks unselected conflicts as skipped", async () => {
    const repository = new FakeImportRepository();
    const projector = new FakeProjector();
    const service = createService(repository, new FakeAnalyzer(), projector);
    repository.existingMatches = [
      {
        relativePath: null,
        detectedDate: parseLocalDate("2025-04-02"),
        fileSha256: null,
        journalId: parseEntityId(JOURNAL_ID),
        journalRevision: 3,
      },
    ];
    const preview = await service.createPreview(
      root,
      files(
        file("202504/20250401.txt", "imported"),
        file("202504/20250402.txt", "conflict"),
      ),
    );

    const result = await service.commit({
      sessionId: preview.session.id,
      expectedSessionRevision: preview.session.revision,
      selectedPaths: ["202504/20250401.txt"],
      conflictPolicy: "skip",
      committedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
    });

    expect(projector.inputs).toHaveLength(1);
    expect(projector.inputs[0]).toMatchObject({
      searchContext: {
        entityType: "journal",
        localDate: "2025-04-01",
      },
    });
    expect(repository.commitInput?.entries[0]).toMatchObject({
      journalId: NEW_JOURNAL_ID,
      previousJournalRevision: null,
      snapshot: {
        journalDate: "2025-04-01",
        checkpoint: "import",
        expectedRevision: null,
        contentMarkdown: "Deploy notes",
        contentPlainText: "Deploy notes",
      },
    });
    expect(result).toMatchObject({
      importedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
  });

  it("records an independent failure audit and returns no successful count when commit fails", async () => {
    const repository = new FakeImportRepository();
    const service = createService(repository);
    const preview = await service.createPreview(
      root,
      files(file("202504/20250401.txt", "will fail")),
    );
    repository.commitError = new Error("disk full");

    const result = await service.commit({
      sessionId: preview.session.id,
      expectedSessionRevision: preview.session.revision,
      selectedPaths: ["202504/20250401.txt"],
      conflictPolicy: "skip",
      committedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
    });

    expect(result).toMatchObject({
      importedCount: 0,
      failedCount: 1,
      status: "failed",
    });
    expect(repository.failureRecords).toHaveLength(1);
    expect(repository.failureRecords[0]).toMatchObject({
      expectedRevision: preview.session.revision + 1,
      errorSummary: "disk full",
    });
  });
});

import "fake-indexeddb/auto";

import type {
  ContentProjector,
  ExportArchiveOptions,
  ExportArtifact,
} from "@dailyflow/application";
import { parseContentHash, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { WebExportSource } from "../src/web/web-export-source.js";
import { WebExportTarget } from "../src/web/web-export-target.js";

const FIXED_TIME = parseUtcTimestamp("2026-10-30T08:00:00.000Z");
const DELETED_TIME = parseUtcTimestamp("2026-10-31T08:00:00.000Z");
const JOURNAL_ID = parseEntityId("019a3c10-0000-7000-8000-000000000001");
const KNOWLEDGE_ID = parseEntityId("019a3c10-0000-7000-8000-000000000002");
const DELETED_KNOWLEDGE_ID = parseEntityId("019a3c10-0000-7000-8000-000000000003");
const TASK_ID = parseEntityId("019a3c10-0000-7000-8000-000000000004");
const TAG_ID = parseEntityId("019a3c10-0000-7000-8000-000000000005");
const ATTACHMENT_ID = parseEntityId("019a3c10-0000-7000-8000-000000000006");
const BLOB_ID = parseEntityId("019a3c10-0000-7000-8000-000000000007");
const SESSION_ID = parseEntityId("019a3c10-0000-7000-8000-000000000008");
const IMPORT_ENTRY_ID = parseEntityId("019a3c10-0000-7000-8000-000000000009");
const ARTIFACT: ExportArtifact = {
  filename: "dailyflow-export-2026-10-30.zip",
  mediaType: "application/zip",
  bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  sha256: "f".repeat(64),
  fileCount: 1,
  entityCount: 1,
  totalUncompressedBytes: 12,
};

const projector: ContentProjector = {
  async project(input) {
    const heading = input.content.doc.heading;
    const rendered = typeof heading === "string" ? heading : "Untitled";
    return {
      contentMarkdown: `# ${rendered}\n`,
      contentPlainText: rendered,
      contentHash: parseContentHash("a".repeat(64)),
      excerpt: rendered,
      structuredBlocks: [],
      searchDocuments: [],
    };
  },
};

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-export-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

async function seedDatabase(database: DailyFlowDb): Promise<void> {
  await database.journals.add({
    id: JOURNAL_ID,
    journalDate: "2026-10-30" as never,
    timezone: "Asia/Shanghai",
    title: "发布记录",
    contentJson: JSON.stringify({ heading: "发布 Web 版本" }),
    editorSchemaVersion: 1,
    contentMarkdown: "STALE",
    contentPlainText: "stale",
    contentHash: parseContentHash("b".repeat(64)),
    projectionVersion: 1,
    excerpt: "发布 Web 版本",
    status: "active",
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    deletedAt: null,
  });
  await database.knowledgeItems.bulkAdd([
    {
      id: KNOWLEDGE_ID,
      kind: "issue",
      status: "active",
      title: "WebView 问题",
      contentJson: JSON.stringify({ heading: "解决 WebView 问题" }),
      editorSchemaVersion: 1,
      contentHash: parseContentHash("c".repeat(64)),
      projectionVersion: 1,
      summary: "问题记录",
      revision: 1,
      sourceJournalId: JOURNAL_ID,
      sourceBlockId: null,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
      deletedAt: null,
    },
    {
      id: DELETED_KNOWLEDGE_ID,
      kind: "note",
      status: "archived",
      title: "已删除记录",
      contentJson: JSON.stringify({ heading: "不应出现" }),
      editorSchemaVersion: 1,
      contentHash: null,
      projectionVersion: 1,
      summary: "",
      revision: 2,
      sourceJournalId: null,
      sourceBlockId: null,
      createdAt: FIXED_TIME,
      updatedAt: DELETED_TIME,
      deletedAt: DELETED_TIME,
    },
  ]);
  await database.tasks.add({
    id: TASK_ID,
    title: "验证导出",
    descriptionJson: null,
    descriptionText: "",
    status: "open",
    priority: "high",
    dueDate: null,
    completedAt: null,
    journalId: JOURNAL_ID,
    knowledgeItemId: null,
    revision: 1,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    deletedAt: null,
  });
  await database.tags.add({
    id: TAG_ID,
    name: "发布",
    nameNormalized: "发布",
    color: null,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  });
  await database.journalTags.add({ journalId: JOURNAL_ID, tagId: TAG_ID });
  await database.knowledgeTags.add({ knowledgeItemId: KNOWLEDGE_ID, tagId: TAG_ID });
  await database.attachmentBlobs.add({
    id: BLOB_ID,
    sha256: parseContentHash("d".repeat(64)),
    byteSize: 4,
    mimeType: "image/png",
    storageKind: "web-blob",
    storageKey: BLOB_ID,
    bytes: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
    createdAt: FIXED_TIME,
    orphanedAt: null,
  });
  await database.attachmentLinks.add({
    id: ATTACHMENT_ID,
    blobId: BLOB_ID,
    ownerType: "journal",
    ownerId: JOURNAL_ID,
    displayName: "截图.png",
    altText: "",
    isInline: false,
    sortOrder: 0,
    createdAt: FIXED_TIME,
    deletedAt: null,
  });
  await database.importSessions.add({
    id: SESSION_ID,
    rootLabel: "历史日志",
    status: "completed",
    optionsJson: JSON.stringify({ source: "txt" }),
    revision: 2,
    scannedCount: 1,
    readyCount: 1,
    importedCount: 1,
    skippedCount: 0,
    conflictCount: 0,
    invalidCount: 0,
    createdAt: FIXED_TIME,
    completedAt: FIXED_TIME,
    errorSummary: null,
  });
  await database.importEntries.add({
    id: IMPORT_ENTRY_ID,
    sessionId: SESSION_ID,
    relativePath: "202610/20261030.txt",
    originalFileName: "20261030.txt",
    detectedDate: "2026-10-30" as never,
    encoding: "utf8",
    newlineStyle: "lf",
    fileSha256: "e".repeat(64),
    rawSize: 5,
    rawCaptureStatus: "captured",
    rawBytes: new TextEncoder().encode("hello"),
    rawCleanedAt: null,
    status: "imported",
    conflictKind: null,
    errorCode: null,
    errorDetail: null,
    journalId: JOURNAL_ID,
    previousJournalRevision: null,
    createdAt: FIXED_TIME,
    committedAt: FIXED_TIME,
  });
}

function archiveOptions(overrides: Partial<ExportArchiveOptions> = {}): ExportArchiveOptions {
  return {
    scope: "all",
    includeDeleted: false,
    includeAttachments: true,
    includeImportRawBytes: true,
    generatedAt: FIXED_TIME,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describe("WebExportSource", () => {
  it("reads a normalized export snapshot from one Dexie database", async () => {
    const database = createDatabase();
    await seedDatabase(database);
    const source = new WebExportSource({ database });

    const artifact = await source.createArchive(archiveOptions(), projector);
    const files = unzipSync(artifact.bytes);
    const journal = new TextDecoder().decode(files["journals/2026/10/2026-10-30.md"]);
    const knowledge = new TextDecoder().decode(files["knowledge.ndjson"]);
    const attachments = new TextDecoder().decode(files["attachments.ndjson"]);
    const imports = new TextDecoder().decode(files["imports/entries.ndjson"]);

    expect(journal).toContain("发布 Web 版本");
    expect(journal).not.toContain("STALE");
    expect(journal).toContain('tags: ["发布"]');
    expect(knowledge).not.toContain(DELETED_KNOWLEDGE_ID);
    expect(attachments).toContain(ATTACHMENT_ID);
    expect(attachments).not.toContain("storageKey");
    expect(imports).toContain("imports/raw/019a3c10-0000-7000-8000-000000000009-20261030.txt.bin");
    expect(
      new TextDecoder().decode(
        files["imports/raw/019a3c10-0000-7000-8000-000000000009-20261030.txt.bin"],
      ),
    ).toBe("hello");
  });

  it("includes soft-deleted records only when requested", async () => {
    const database = createDatabase();
    await seedDatabase(database);
    const source = new WebExportSource({ database });

    const artifact = await source.createArchive(
      archiveOptions({ scope: "knowledge", includeDeleted: true }),
      projector,
    );
    const knowledge = new TextDecoder().decode(unzipSync(artifact.bytes)["knowledge.ndjson"]);

    expect(knowledge).toContain(DELETED_KNOWLEDGE_ID);
    expect(knowledge).toContain("已删除记录");
  });

  it("estimates the archive without exposing storage keys", async () => {
    const database = createDatabase();
    await seedDatabase(database);
    const source = new WebExportSource({ database });

    await expect(
      source.estimate({
        scope: "all",
        includeDeleted: false,
        includeAttachments: true,
        includeImportRawBytes: true,
      }),
    ).resolves.toMatchObject({
      entityCount: 6,
      fileCount: expect.any(Number),
      estimatedBytes: expect.any(Number),
    });
  });
});

describe("WebExportTarget", () => {
  it("writes the ZIP through the File System Access API", async () => {
    const writes: Uint8Array[] = [];
    let closed = false;
    const target = new WebExportTarget({
      saveFilePicker: async () => ({
        name: ARTIFACT.filename,
        createWritable: async () => ({
          write: async (bytes) => {
            writes.push(Uint8Array.from(bytes));
          },
          close: async () => {
            closed = true;
          },
        }),
      }),
    });

    await expect(target.save(ARTIFACT)).resolves.toEqual({
      filename: ARTIFACT.filename,
      bytesWritten: ARTIFACT.bytes.byteLength,
    });
    expect(writes).toEqual([ARTIFACT.bytes]);
    expect(closed).toBe(true);
  });

  it("treats a cancelled save dialog as a cancelled export", async () => {
    const target = new WebExportTarget({
      saveFilePicker: async () => {
        throw new DOMException("The user cancelled the picker.", "AbortError");
      },
    });

    await expect(target.save(ARTIFACT)).resolves.toBeNull();
  });

  it("falls back to a browser download when the save picker is unavailable", async () => {
    let downloaded: ExportArtifact | null = null;
    const target = new WebExportTarget({
      download: async (artifact) => {
        downloaded = artifact;
      },
    });

    await expect(target.save(ARTIFACT)).resolves.toEqual({
      filename: ARTIFACT.filename,
      bytesWritten: ARTIFACT.bytes.byteLength,
    });
    expect(downloaded).toBe(ARTIFACT);
  });
});

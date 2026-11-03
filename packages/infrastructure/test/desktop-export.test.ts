import type { ContentProjector } from "@dailyflow/application";
import { parseContentHash, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { DesktopExportSource } from "../src/desktop/desktop-export-source.js";
import { DesktopExportTarget } from "../src/desktop/desktop-export-target.js";
import type { ExportSnapshotDto } from "../src/desktop/tauri-contracts.js";

const FIXED_TIME = parseUtcTimestamp("2026-10-30T08:00:00.000Z");
const JOURNAL_ID = parseEntityId("019a3c10-0000-7000-8000-000000000001");
const KNOWLEDGE_ID = parseEntityId("019a3c10-0000-7000-8000-000000000002");
const TASK_ID = parseEntityId("019a3c10-0000-7000-8000-000000000003");
const ATTACHMENT_ID = parseEntityId("019a3c10-0000-7000-8000-000000000004");
const BLOB_ID = parseEntityId("019a3c10-0000-7000-8000-000000000005");
const SESSION_ID = parseEntityId("019a3c10-0000-7000-8000-000000000006");
const IMPORT_ENTRY_ID = parseEntityId("019a3c10-0000-7000-8000-000000000007");

const projector: ContentProjector = {
  async project(input) {
    const heading = input.content.doc.heading;
    return {
      contentMarkdown: `# ${typeof heading === "string" ? heading : "Untitled"}\n`,
      contentPlainText: typeof heading === "string" ? heading : "Untitled",
      contentHash: parseContentHash("a".repeat(64)),
      excerpt: "",
      structuredBlocks: [],
      searchDocuments: [],
    };
  },
};

function snapshot(): ExportSnapshotDto {
  return {
    journals: [
      {
        id: JOURNAL_ID,
        journalDate: "2026-10-30" as never,
        timezone: "Asia/Shanghai",
        title: "发布记录",
        contentJson: { heading: "桌面导出" },
        contentMarkdown: "STALE",
        contentPlainText: "stale",
        editorSchemaVersion: 1,
        projectionVersion: 1,
        contentHash: parseContentHash("b".repeat(64)),
        excerpt: "",
        status: "active",
        revision: 1,
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
        deletedAt: null,
        tags: ["desktop"],
        structuredBlocks: [],
      },
    ],
    knowledge: [
      {
        item: {
          id: KNOWLEDGE_ID,
          kind: "issue",
          status: "active",
          title: "导出问题",
          contentJson: { heading: "排查导出" },
          editorSchemaVersion: 1,
          contentHash: parseContentHash("c".repeat(64)),
          projectionVersion: 1,
          summary: "",
          revision: 1,
          sourceJournalId: JOURNAL_ID,
          sourceBlockId: null,
          createdAt: FIXED_TIME,
          updatedAt: FIXED_TIME,
          deletedAt: null,
        },
        tags: ["release"],
      },
    ],
    tasks: [
      {
        id: TASK_ID,
        title: "验证桌面导出",
        descriptionJson: null,
        descriptionText: "",
        status: "open",
        priority: "normal",
        dueDate: null,
        completedAt: null,
        journalId: JOURNAL_ID,
        knowledgeItemId: null,
        revision: 1,
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
        deletedAt: null,
      },
    ],
    attachments: [
      {
        attachment: {
          id: ATTACHMENT_ID,
          blobId: BLOB_ID,
          ownerType: "journal",
          ownerId: JOURNAL_ID,
          displayName: "截图.png",
          altText: "",
          isInline: false,
          sortOrder: 0,
          mimeType: "image/png",
          byteSize: 4,
          sha256: parseContentHash("d".repeat(64)),
          createdAt: FIXED_TIME,
          deletedAt: null,
        },
        bytesBase64: "AQIDBA==",
      },
    ],
    imports: {
      sessions: [
        {
          id: SESSION_ID,
          rootLabel: "历史日志",
          status: "completed",
          options: {},
          revision: 2,
          scannedCount: 1,
          readyCount: 1,
          importedCount: 1,
          skippedCount: 0,
          conflictCount: 0,
          invalidCount: 0,
          entries: [],
          createdAt: FIXED_TIME,
          completedAt: FIXED_TIME,
          errorSummary: null,
        },
      ],
      entries: [
        {
          sessionId: SESSION_ID,
          entry: {
            id: IMPORT_ENTRY_ID,
            relativePath: "202610/20261030.txt",
            originalFileName: "20261030.txt",
            detectedDate: "2026-10-30" as never,
            encoding: "utf8",
            newlineStyle: "lf",
            fileSha256: "e".repeat(64),
            rawSize: 5,
            rawCaptureStatus: "captured",
            rawBytesBase64: "aGVsbG8=",
            rawCleanedAt: null,
            status: "imported",
            conflictKind: null,
            errorCode: null,
            errorDetail: null,
            journalId: JOURNAL_ID,
            previousJournalRevision: null,
            createdAt: FIXED_TIME,
            committedAt: FIXED_TIME,
          },
        },
      ],
    },
  };
}

describe("DesktopExportSource", () => {
  it("builds an archive from one desktop snapshot without leaking storage paths", async () => {
    const exportSnapshot = vi.fn().mockResolvedValue(snapshot());
    const source = new DesktopExportSource({ client: { exportSnapshot } });

    const artifact = await source.createArchive(
      {
        scope: "all",
        includeDeleted: false,
        includeAttachments: true,
        includeImportRawBytes: true,
        generatedAt: FIXED_TIME,
      },
      projector,
    );
    const files = unzipSync(artifact.bytes);
    const journal = new TextDecoder().decode(files["journals/2026/10/2026-10-30.md"]);
    const attachmentText = new TextDecoder().decode(files["attachments.ndjson"]);
    const rawImport = new TextDecoder().decode(
      files["imports/raw/019a3c10-0000-7000-8000-000000000007-20261030.txt.bin"],
    );

    expect(exportSnapshot).toHaveBeenCalledOnce();
    expect(journal).toContain("桌面导出");
    expect(journal).not.toContain("STALE");
    expect(attachmentText).not.toContain("storageKey");
    expect(attachmentText).not.toContain("attachments/");
    expect(rawImport).toBe("hello");
  });

  it("estimates from the same normalized snapshot", async () => {
    const source = new DesktopExportSource({
      client: { exportSnapshot: async () => snapshot() },
    });

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

describe("DesktopExportTarget", () => {
  it("writes the exact ZIP bytes and SHA-256 to the selected absolute path", async () => {
    const writeExportFile = vi.fn().mockResolvedValue({ bytesWritten: 4 });
    const picker = vi.fn().mockResolvedValue("F:\\backup\\dailyflow.zip");
    const target = new DesktopExportTarget({
      client: { writeExportFile },
      picker,
    });

    await expect(
      target.save({
        filename: "dailyflow.zip",
        mediaType: "application/zip",
        bytes: new Uint8Array([1, 2, 3, 4]),
        sha256: "f".repeat(64),
        fileCount: 1,
        entityCount: 1,
        totalUncompressedBytes: 4,
      }),
    ).resolves.toEqual({
      filename: "dailyflow.zip",
      bytesWritten: 4,
    });
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "dailyflow.zip",
      extensions: ["zip"],
    });
    expect(writeExportFile).toHaveBeenCalledWith({
      targetPath: "F:\\backup\\dailyflow.zip",
      bytesBase64: "AQIDBA==",
      expectedSha256: "f".repeat(64),
    });
  });

  it("does not call the filesystem after the save dialog is cancelled", async () => {
    const writeExportFile = vi.fn();
    const target = new DesktopExportTarget({
      client: { writeExportFile },
      picker: async () => null,
    });

    await expect(
      target.save({
        filename: "dailyflow.zip",
        mediaType: "application/zip",
        bytes: new Uint8Array([1]),
        sha256: "f".repeat(64),
        fileCount: 1,
        entityCount: 0,
        totalUncompressedBytes: 1,
      }),
    ).resolves.toBeNull();
    expect(writeExportFile).not.toHaveBeenCalled();
  });
});

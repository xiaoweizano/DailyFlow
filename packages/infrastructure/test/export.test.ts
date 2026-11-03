import type { ContentProjector, ExportDataset } from "@dailyflow/application";
import type { ContentHash, EntityId, UtcTimestamp } from "@dailyflow/domain";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  buildExportArchive,
  createExportArtifact,
  sanitizeExportFileName,
} from "../src/shared/export/export-archive.js";

const ids = {
  journal: "019a3c10-0000-7000-8000-000000000001",
  knowledge: "019a3c10-0000-7000-8000-000000000002",
  task: "019a3c10-0000-7000-8000-000000000003",
  deletedKnowledge: "019a3c10-0000-7000-8000-000000000004",
  attachment: "019a3c10-0000-7000-8000-000000000005",
  blob: "019a3c10-0000-7000-8000-000000000006",
  importSession: "019a3c10-0000-7000-8000-000000000007",
  importEntry: "019a3c10-0000-7000-8000-000000000008",
} as const;

const fixedTime = "2026-10-30T08:00:00.000Z" as UtcTimestamp;

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const ownedBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const projector: ContentProjector = {
  async project(input) {
    const heading = input.content.doc.heading;
    const markdown = typeof heading === "string" ? heading : "Untitled";
    return {
      contentMarkdown: `Projected ${markdown}\n`,
      contentPlainText: `Projected ${markdown}`,
      contentHash: "a".repeat(64) as ContentHash,
      excerpt: `Projected ${markdown}`,
      structuredBlocks: [],
      searchDocuments: [],
    };
  },
};

function fixture(): ExportDataset {
  return {
    journals: [
      {
        journal: {
          id: ids.journal,
          journalDate: "2026-10-30",
          timezone: "Asia/Shanghai",
          title: "发布准备",
          content: { schemaVersion: 1, doc: { heading: "发布清单" } },
          contentMarkdown: "STALE MARKDOWN MUST NOT BE EXPORTED",
          contentPlainText: "stale",
          contentHash: "b".repeat(64),
          projectionVersion: 1,
          excerpt: "",
          status: "active",
          revision: 2,
          createdAt: fixedTime,
          updatedAt: fixedTime,
          deletedAt: null,
        },
        tags: ["release", "dailyflow"],
      },
    ],
    knowledge: [
      {
        item: {
          id: ids.knowledge,
          kind: "issue",
          status: "active",
          title: "构建失败: WebView2",
          content: { schemaVersion: 1, doc: { heading: "排查步骤" } },
          contentHash: "c".repeat(64),
          projectionVersion: 1,
          summary: "WebView2 环境问题",
          revision: 3,
          sourceJournalId: ids.journal,
          sourceBlockId: null,
          createdAt: fixedTime,
          updatedAt: fixedTime,
          deletedAt: null,
        },
        tags: ["windows"],
      },
      {
        item: {
          id: ids.deletedKnowledge,
          kind: "note",
          status: "active",
          title: "已删除草稿",
          content: { schemaVersion: 1, doc: { heading: "不应导出" } },
          contentHash: null,
          projectionVersion: 1,
          summary: "",
          revision: 1,
          sourceJournalId: null,
          sourceBlockId: null,
          createdAt: fixedTime,
          updatedAt: fixedTime,
          deletedAt: "2026-10-30T09:00:00.000Z",
        },
        tags: [],
      },
    ],
    tasks: [
      {
        id: ids.task,
        title: "验证签名",
        description: null,
        descriptionText: "",
        status: "open",
        priority: "high",
        dueDate: "2026-11-01",
        completedAt: null,
        journalId: ids.journal,
        knowledgeItemId: null,
        revision: 1,
        createdAt: fixedTime,
        updatedAt: fixedTime,
        deletedAt: null,
      },
    ],
    attachments: [
      {
        attachment: {
          id: ids.attachment,
          blobId: ids.blob,
          ownerType: "journal",
          ownerId: ids.journal,
          displayName: "构建:失败.png",
          altText: "构建失败截图",
          isInline: true,
          sortOrder: 0,
          mimeType: "image/png",
          byteSize: 4,
          storageKind: "desktop-file",
          storageKey: "C:\\Users\\office\\secret.png",
          sha256: "d".repeat(64),
          createdAt: fixedTime,
          deletedAt: null,
        },
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
    ],
    imports: {
      sessions: [
        {
          id: ids.importSession,
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
          createdAt: fixedTime,
          completedAt: fixedTime,
          errorSummary: null,
        },
      ],
      entries: [
        {
          sessionId: ids.importSession,
          entry: {
            id: ids.importEntry,
            relativePath: "202610/20261030.txt",
            originalFileName: "20261030.txt",
            detectedDate: "2026-10-30",
            encoding: "utf8",
            newlineStyle: "lf",
            fileSha256: "e".repeat(64),
            rawSize: 5,
            rawCaptureStatus: "captured",
            rawBytes: new Uint8Array([104, 101, 108, 108, 111]),
            rawCleanedAt: null,
            status: "imported",
            conflictKind: null,
            errorCode: null,
            errorDetail: null,
            journalId: ids.journal,
            previousJournalRevision: null,
            createdAt: fixedTime,
            committedAt: fixedTime,
          },
        },
      ],
    },
  } as unknown as ExportDataset;
}

describe("export archive", () => {
  it("projects authoritative JSON into stable markdown and NDJSON", async () => {
    const first = await buildExportArchive({
      dataset: fixture(),
      projector,
      generatedAt: fixedTime,
    });
    const second = await buildExportArchive({
      dataset: fixture(),
      projector,
      generatedAt: fixedTime,
    });

    expect(first.files.map((file) => file.path)).toEqual(second.files.map((file) => file.path));
    expect(first.sha256).toBe(second.sha256);

    const journal = first.files.find((file) => file.path === "journals/2026/10/2026-10-30.md");
    expect(new TextDecoder().decode(journal?.bytes)).toContain("Projected 发布清单");
    expect(new TextDecoder().decode(journal?.bytes)).not.toContain("STALE");

    const knowledge = first.files.find(
      (file) => file.path === "knowledge/issue/构建失败 WebView2.md",
    );
    expect(new TextDecoder().decode(knowledge?.bytes)).toContain("Projected 排查步骤");

    const knowledgeNdjson = new TextDecoder().decode(
      first.files.find((file) => file.path === "knowledge.ndjson")?.bytes,
    );
    const knowledgeLines = knowledgeNdjson
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(knowledgeLines).toHaveLength(1);
    expect(knowledgeLines[0]).toMatchObject({
      entityType: "knowledge_item",
      schemaVersion: 1,
      id: ids.knowledge,
    });
    expect(knowledgeNdjson).not.toContain(ids.deletedKnowledge);
    expect(knowledgeNdjson).not.toContain("已删除草稿");

    const taskLine = JSON.parse(
      new TextDecoder().decode(first.files.find((file) => file.path === "tasks.ndjson")?.bytes),
    );
    expect(Object.keys(taskLine)).toEqual([
      "entityType",
      "schemaVersion",
      "id",
      "deletedAt",
      "data",
    ]);

    const attachmentText = new TextDecoder().decode(
      first.files.find((file) => file.path === "attachments.ndjson")?.bytes,
    );
    expect(attachmentText).not.toContain("storageKey");
    expect(attachmentText).not.toContain("C:\\Users");
    expect(first.files.some((file) => file.path.startsWith("attachments/"))).toBe(true);
    expect(first.files.some((file) => file.path.startsWith("imports/raw/"))).toBe(true);
  });

  it("sorts NDJSON by entity type and stable ID and hashes binary bytes unchanged", async () => {
    const base = fixture();
    const dataset: ExportDataset = {
      ...base,
      tasks: [
        ...base.tasks,
        {
          ...base.tasks[0]!,
          id: "019a3c10-0000-7000-8000-000000000001" as EntityId,
          title: "先创建的任务",
        },
        {
          ...base.tasks[0]!,
          id: "019a3c10-0000-7000-8000-000000000002" as EntityId,
          title: "后创建的任务",
        },
      ],
      attachments: base.attachments.map((record, index) =>
        index === 0 ? { ...record, bytes: new Uint8Array([0, 255, 128, 13, 10]) } : record,
      ),
    };

    const archive = await buildExportArchive({
      dataset,
      projector,
      generatedAt: fixedTime,
    });
    const taskLines = new TextDecoder()
      .decode(archive.files.find((file) => file.path === "tasks.ndjson")?.bytes)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { readonly id: string });
    expect(taskLines.map((line) => line.id)).toEqual([
      "019a3c10-0000-7000-8000-000000000001",
      "019a3c10-0000-7000-8000-000000000002",
      ids.task,
    ]);

    const attachmentManifest = archive.manifest.files.find((file) =>
      file.path.startsWith("attachments/"),
    );
    expect(attachmentManifest?.sha256).toBe(
      await sha256BytesHex(new Uint8Array([0, 255, 128, 13, 10])),
    );
  });

  it("sanitizes cross-platform names and disambiguates case-insensitive collisions", async () => {
    expect(sanitizeExportFileName("CON")).toBe("_CON");
    expect(sanitizeExportFileName("report?.txt")).toBe("report .txt");
    expect(sanitizeExportFileName("...")).toBe("untitled");

    const base = fixture();
    const dataset: ExportDataset = {
      ...base,
      knowledge: [
        ...base.knowledge,
        {
          ...base.knowledge[0]!,
          item: {
            ...base.knowledge[0]!.item,
            id: "019a3c10-0000-7000-8000-000000000010" as EntityId,
            title: "同名问题",
          },
        },
        {
          ...base.knowledge[0]!,
          item: {
            ...base.knowledge[0]!.item,
            id: "019a3c10-0000-7000-8000-000000000011" as EntityId,
            title: "同名问题.",
          },
        },
      ],
    };

    const archive = await buildExportArchive({
      dataset,
      projector,
      generatedAt: fixedTime,
    });
    const collisionPaths = archive.files
      .map((file) => file.path)
      .filter((path) => path.startsWith("knowledge/issue/同名问题"));
    expect(collisionPaths).toEqual([
      "knowledge/issue/同名问题-00000010.md",
      "knowledge/issue/同名问题-00000011.md",
    ]);
    expect(new Set(collisionPaths).size).toBe(collisionPaths.length);
  });

  it("creates a deterministic ZIP with fixed ordering and metadata", async () => {
    const first = await createExportArtifact(
      await buildExportArchive({
        dataset: fixture(),
        projector,
        generatedAt: fixedTime,
      }),
      "dailyflow-2026-10-30.zip",
    );
    const second = await createExportArtifact(
      await buildExportArchive({
        dataset: fixture(),
        projector,
        generatedAt: fixedTime,
      }),
      "dailyflow-2026-10-30.zip",
    );

    expect(first.mediaType).toBe("application/zip");
    expect(first.sha256).toBe(await sha256BytesHex(first.bytes));
    expect(second.sha256).toBe(first.sha256);
    expect(Array.from(first.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const files = unzipSync(first.bytes);
    expect(Object.keys(files)).toEqual([
      "README.txt",
      "attachments.ndjson",
      "attachments/构建 失败.png",
      "imports/entries.ndjson",
      "imports/raw/019a3c10-0000-7000-8000-000000000008-20261030.txt.bin",
      "imports/sessions.ndjson",
      "journals/2026/10/2026-10-30.md",
      "knowledge.ndjson",
      "knowledge/issue/构建失败 WebView2.md",
      "manifest.json",
      "tasks.ndjson",
    ]);
  });
});

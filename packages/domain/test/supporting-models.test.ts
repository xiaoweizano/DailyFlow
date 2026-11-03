import { describe, expect, it } from "vitest";

import {
  createAttachmentRef,
  createContentDocument,
  createImportSession,
  createKnowledgeItem,
  createReport,
  createTag,
  type Clock,
  type IdGenerator,
} from "../src/index.js";

const ids: IdGenerator = {
  nextId: () => "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
};

const clock: Clock = {
  nowUtc: () => "2026-10-30T03:20:11.123Z",
};

const content = createContentDocument(1, {
  type: "doc",
  content: [],
});

describe("supporting domain models", () => {
  it("creates a knowledge draft while retaining its source references", () => {
    const item = createKnowledgeItem(
      {
        kind: "issue",
        title: "WebView2 启动闪退",
        content,
        projectionVersion: 1,
        sourceJournalId: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
        sourceBlockId: "0198e2f4-7e35-7c70-a8b2-18c1520f9c26",
      },
      { ids, clock },
    );

    expect(item.revision).toBe(0);
    expect(item.projectionVersion).toBe(1);
    expect(item.sourceJournalId).toBe("0198e2f4-7e34-7c70-a8b2-18c1520f9c26");
    expect(item.sourceBlockId).toBe("0198e2f4-7e35-7c70-a8b2-18c1520f9c26");
  });

  it("does not silently convert an empty knowledge source ID into no source", () => {
    expect(() =>
      createKnowledgeItem(
        {
          kind: "issue",
          title: "WebView2 启动闪退",
          content,
          projectionVersion: 1,
          sourceJournalId: "",
        },
        { ids, clock },
      ),
    ).toThrow("UUIDv7");
  });

  it("normalizes tag identity without changing the display name", () => {
    const tag = createTag({ name: "  Web   开发  ", color: "#2563eb" }, { ids, clock });

    expect(tag.name.value).toBe("  Web   开发  ");
    expect(tag.name.normalized).toBe("web 开发");
  });

  it("rejects absolute desktop attachment paths", () => {
    const input = {
      ownerType: "journal" as const,
      ownerId: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
      displayName: "screenshot.png",
      mimeType: "image/png",
      byteSize: 2048,
      storageKind: "desktop-file" as const,
      storageKey: "C:\\Users\\me\\screenshot.png",
      sha256: "37ea0eaf881513383c7946fe8d45394d83c549ade33c85475476380fe2f3490d",
    };

    expect(() => createAttachmentRef(input, { ids, clock })).toThrow("relative");
  });

  it("does not replace an empty attachment blob ID with a generated ID", () => {
    expect(() =>
      createAttachmentRef(
        {
          blobId: "",
          ownerType: "journal",
          ownerId: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
          displayName: "screenshot.png",
          mimeType: "image/png",
          byteSize: 2048,
          storageKind: "desktop-file",
          storageKey: "attachments/ab/screenshot.png",
          sha256: "37ea0eaf881513383c7946fe8d45394d83c549ade33c85475476380fe2f3490d",
        },
        { ids, clock },
      ),
    ).toThrow("UUIDv7");
  });

  it("generates a blob ID when one is not supplied", () => {
    const generatedIds = [
      "0198e2f4-7e33-7c70-a8b2-18c1520f9c27",
      "0198e2f4-7e33-7c70-a8b2-18c1520f9c28",
    ];
    const sequentialIds: IdGenerator = {
      nextId: () => generatedIds.shift()!,
    };

    const attachment = createAttachmentRef(
      {
        ownerType: "journal",
        ownerId: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
        displayName: "screenshot.png",
        mimeType: "image/png",
        byteSize: 2048,
        storageKind: "desktop-file",
        storageKey: "attachments/ab/screenshot.png",
        sha256: "37ea0eaf881513383c7946fe8d45394d83c549ade33c85475476380fe2f3490d",
      },
      { ids: sequentialIds, clock },
    );

    expect(attachment.blobId).toBe("0198e2f4-7e33-7c70-a8b2-18c1520f9c28");
  });

  it("starts a new import session in scanning state at revision one", () => {
    const session = createImportSession(
      {
        rootLabel: "历史日志",
        options: { conflictPolicy: "skip" },
      },
      { ids, clock },
    );

    expect(session.status).toBe("scanning");
    expect(session.scannedCount).toBe(0);
    expect(session.entries).toEqual([]);
    expect(session.revision).toBe(1);
  });

  it("creates a report for a validated period without converting its dates", () => {
    const report = createReport(
      {
        periodType: "month",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        timezone: "Asia/Shanghai",
        title: "2026 年 10 月总结",
        content,
        projectionVersion: 1,
        stats: { journalDays: 12 },
      },
      { ids, clock },
    );

    expect(report.periodStart).toBe("2026-10-01");
    expect(report.periodEnd).toBe("2026-10-31");
    expect(report.revision).toBe(0);
    expect(report.projectionVersion).toBe(1);
  });

  it("does not silently convert an empty source watermark into no watermark", () => {
    expect(() =>
      createReport(
        {
          periodType: "month",
          periodStart: "2026-10-01",
          periodEnd: "2026-10-31",
          timezone: "Asia/Shanghai",
          title: "2026 年 10 月总结",
          content,
          projectionVersion: 1,
          stats: { journalDays: 12 },
          sourceWatermark: "",
        },
        { ids, clock },
      ),
    ).toThrow(RangeError);
  });
});

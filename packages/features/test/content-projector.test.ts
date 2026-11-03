import {
  createContentDocument,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import { describe, expect, it } from "vitest";

import { EditorContentProjector } from "../src/journal/content-projector.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const blockId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c28");

const content = createContentDocument(1, {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Deployment review" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "The rollback was verified." }],
    },
    {
      type: "structuredBlock",
      attrs: {
        id: blockId,
        blockType: "issue",
        schemaVersion: 1,
        data: {
          symptom: "Health check timed out",
          solution: "Increase the startup grace period",
        },
      },
    },
  ],
});

describe("EditorContentProjector", () => {
  it("creates stable markdown, text, hash, excerpt, structured and search projections", async () => {
    const projector = new EditorContentProjector();
    const input = {
      content,
      tags: ["deployment", "Windows"],
      searchContext: {
        ownerEntityId: journalId,
        entityType: "journal" as const,
        title: "Deployment review",
        localDate: parseLocalDate("2026-10-30"),
        updatedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
      },
    };

    const first = await projector.project(input);
    const second = await projector.project(input);

    expect(first.contentMarkdown).toContain("## Deployment review");
    expect(first.contentMarkdown).toContain("```dailyflow-structured");
    expect(first.contentPlainText).toContain("Health check timed out");
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.excerpt).toBe(
      "Deployment review The rollback was verified. Health check timed out Increase the startup grace period",
    );
    expect(first.structuredBlocks).toEqual([
      expect.objectContaining({
        id: blockId,
        blockType: "issue",
        orderKey: "000000000001",
      }),
    ]);
    expect(first.searchDocuments).toHaveLength(2);
    expect(first.searchDocuments[0]).toMatchObject({
      id: journalId,
      entityType: "journal",
      entityId: journalId,
      title: "Deployment review",
      localDate: "2026-10-30",
      updatedAt: "2026-10-30T03:20:11.123Z",
      contentHash: first.contentHash,
      indexVersion: 1,
    });
    expect(first.searchDocuments[1]).toMatchObject({
      id: blockId,
      entityType: "structured_block",
      entityId: blockId,
      title: "Deployment review · issue",
      localDate: "2026-10-30",
    });
    expect(first.searchDocuments[0]?.normalizedText).toContain("deployment review");
    expect(first.searchDocuments[0]?.tokenizedText).toContain("de");
  });

  it("uses readable fallback titles when the journal title is empty", async () => {
    const projector = new EditorContentProjector();
    const projected = await projector.project({
      content,
      tags: [],
      searchContext: {
        ownerEntityId: journalId,
        entityType: "journal",
        title: "",
        localDate: parseLocalDate("2026-10-30"),
        updatedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
      },
    });

    expect(projected.searchDocuments[0]?.title).toBe("Deployment review");
    expect(projected.searchDocuments[1]?.title).toBe("Deployment review · issue");
  });
});

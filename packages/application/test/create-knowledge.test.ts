import { describe, expect, it } from "vitest";

import { createKnowledge } from "../src/use-cases/create-knowledge.js";
import {
  FakeKnowledgeRepository,
  FakeProjector,
  KNOWLEDGE_ID,
  PROJECTED_HASH,
  SequenceIds,
  clock,
} from "./support.js";

describe("createKnowledge", () => {
  it("creates a standalone knowledge item from editor JSON", async () => {
    const knowledge = new FakeKnowledgeRepository();
    const projector = new FakeProjector();

    const result = await createKnowledge(
      {
        knowledge,
        projector,
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        kind: "note",
        title: "  Deployment checklist  ",
        summary: "  Verify the rollback path.  ",
        contentSchemaVersion: 1,
        contentJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Check the release candidate." }],
            },
          ],
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected createKnowledge to succeed");
    }
    expect(result.value).toMatchObject({
      id: KNOWLEDGE_ID,
      kind: "note",
      title: "Deployment checklist",
      summary: "Verify the rollback path.",
      sourceJournalId: null,
      sourceBlockId: null,
      contentHash: PROJECTED_HASH,
      projectionVersion: 1,
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Check the release candidate." }],
            },
          ],
        },
      },
    });
    expect(projector.inputs).toEqual([{ content: result.value.content, tags: [] }]);
    expect(knowledge.savedItems).toEqual([{ item: result.value, expectedRevision: null }]);
  });

  it("uses the projected excerpt when no summary is supplied", async () => {
    const projector = new FakeProjector();
    projector.result = {
      ...projector.result,
      excerpt: "A concise generated summary.",
    };

    const result = await createKnowledge(
      {
        knowledge: new FakeKnowledgeRepository(),
        projector,
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        kind: "issue",
        title: "Deployment failed",
        contentSchemaVersion: 1,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Details" }] }],
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected createKnowledge to succeed");
    }
    expect(result.value.summary).toBe("A concise generated summary.");
  });

  it("rejects an empty title without writing storage", async () => {
    const knowledge = new FakeKnowledgeRepository();

    const result = await createKnowledge(
      {
        knowledge,
        projector: new FakeProjector(),
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        kind: "note",
        title: "   ",
        contentSchemaVersion: 1,
        contentJson: { type: "doc", content: [] },
      },
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: expect.objectContaining({ title: expect.any(String) }),
      }),
    });
    expect(knowledge.savedItems).toHaveLength(0);
  });

  it("maps knowledge persistence failures to a retryable application error", async () => {
    const knowledge = new FakeKnowledgeRepository();
    knowledge.saveError = new Error("database unavailable");

    const result = await createKnowledge(
      {
        knowledge,
        projector: new FakeProjector(),
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        kind: "note",
        title: "Deployment checklist",
        contentSchemaVersion: 1,
        contentJson: { type: "doc", content: [] },
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_UNAVAILABLE",
        retryable: true,
      },
    });
    expect(knowledge.savedItems).toHaveLength(0);
  });
});

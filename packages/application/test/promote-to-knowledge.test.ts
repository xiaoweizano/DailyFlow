import { describe, expect, it } from "vitest";

import { promoteToKnowledge } from "../src/use-cases/promote-to-knowledge.js";
import {
  BLOCK_ID,
  FakeJournalRepository,
  FakeKnowledgeRepository,
  FakeProjector,
  JOURNAL_ID,
  KNOWLEDGE_ID,
  PROJECTED_HASH,
  SequenceIds,
  clock,
  makeJournal,
} from "./support.js";

describe("promoteToKnowledge", () => {
  it("keeps the promoted knowledge snapshot independent from later journal edits", async () => {
    const journals = new FakeJournalRepository();
    const sourceJournal = makeJournal({
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Initial incident notes" }],
            },
          ],
        },
      },
    });
    journals.journalById = sourceJournal;
    const knowledge = new FakeKnowledgeRepository();

    const result = await promoteToKnowledge(
      {
        journals,
        knowledge,
        projector: new FakeProjector(),
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        journalId: JOURNAL_ID,
        kind: "note",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected promoteToKnowledge to succeed");
    }
    expect(result.value.content).not.toBe(sourceJournal.content);
    expect(result.value.content.doc).not.toBe(sourceJournal.content.doc);

    const sourceParagraph = (
      sourceJournal.content.doc.content as Array<{
        content?: Array<{ text?: string }>;
      }>
    )[0];
    if (sourceParagraph?.content?.[0] !== undefined) {
      sourceParagraph.content[0].text = "Changed after promotion";
    }

    expect(result.value.content.doc).toMatchObject({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Initial incident notes" }],
        },
      ],
    });
  });

  it("copies only the selected structured block into a block knowledge snapshot", async () => {
    const journals = new FakeJournalRepository();
    journals.journalById = makeJournal({
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "structuredBlock",
              attrs: {
                id: BLOCK_ID,
                blockType: "solution",
                schemaVersion: 1,
                data: { text: "Rollback the unhealthy release." },
              },
            },
            {
              type: "structuredBlock",
              attrs: {
                id: "0198e2f4-7e33-7c70-a8b2-18c1520f9c29",
                blockType: "note",
                schemaVersion: 1,
                data: { text: "Unrelated note." },
              },
            },
          ],
        },
      },
    });
    const projector = new FakeProjector();

    const result = await promoteToKnowledge(
      {
        journals,
        knowledge: new FakeKnowledgeRepository(),
        projector,
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        journalId: JOURNAL_ID,
        sourceBlockId: BLOCK_ID,
        kind: "solution",
      },
    );

    expect(result.ok).toBe(true);
    expect(projector.inputs).toHaveLength(1);
    expect(projector.inputs[0]?.content.doc).toMatchObject({
      content: [
        {
          type: "structuredBlock",
          attrs: {
            id: BLOCK_ID,
            data: { text: "Rollback the unhealthy release." },
          },
        },
      ],
    });
    if (!result.ok) {
      throw new Error("Expected promoteToKnowledge to succeed");
    }
    expect(result.value.content.doc).toMatchObject({
      content: [
        {
          type: "structuredBlock",
          attrs: {
            id: BLOCK_ID,
            data: { text: "Rollback the unhealthy release." },
          },
        },
      ],
    });
  });

  it("treats a null source block as a whole-journal snapshot", async () => {
    const journals = new FakeJournalRepository();
    journals.journalById = makeJournal({
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Whole journal snapshot" }],
            },
          ],
        },
      },
    });
    const projector = new FakeProjector();

    const result = await promoteToKnowledge(
      {
        journals,
        knowledge: new FakeKnowledgeRepository(),
        projector,
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        journalId: JOURNAL_ID,
        sourceBlockId: null,
        kind: "note",
      },
    );

    expect(result.ok).toBe(true);
    expect(projector.inputs[0]?.content.doc).toMatchObject({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Whole journal snapshot" }],
        },
      ],
    });
  });

  it("creates a knowledge item while preserving its journal and block source", async () => {
    const journals = new FakeJournalRepository();
    journals.journalById = makeJournal({
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "structuredBlock",
              attrs: {
                id: BLOCK_ID,
                blockType: "solution",
                schemaVersion: 1,
                data: { text: "Rollback the unhealthy release." },
              },
            },
          ],
        },
      },
    });
    const knowledge = new FakeKnowledgeRepository();
    const projector = new FakeProjector();
    const ids = new SequenceIds([KNOWLEDGE_ID]);

    const result = await promoteToKnowledge(
      { journals, knowledge, projector, ids, clock },
      {
        journalId: JOURNAL_ID,
        sourceBlockId: BLOCK_ID,
        kind: "solution",
        title: "Resolve deployment failure",
        summary: "Rollback the unhealthy release.",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected promoteToKnowledge to succeed");
    }
    expect(result.value.id).toBe(KNOWLEDGE_ID);
    expect(result.value.sourceJournalId).toBe(JOURNAL_ID);
    expect(result.value.sourceBlockId).toBe(BLOCK_ID);
    expect(result.value.contentMarkdown).toBe("Deploy notes");
    expect(result.value.contentPlainText).toBe("Deploy notes");
    expect(result.value.contentHash).toBe(PROJECTED_HASH);
    expect(knowledge.savedItems).toEqual([
      {
        item: result.value,
        expectedRevision: null,
      },
    ]);
  });

  it("returns not found without creating a partial knowledge item", async () => {
    const journals = new FakeJournalRepository();
    const knowledge = new FakeKnowledgeRepository();
    const projector = new FakeProjector();

    const result = await promoteToKnowledge(
      {
        journals,
        knowledge,
        projector,
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        journalId: JOURNAL_ID,
        kind: "note",
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        entity: "journal",
        id: JOURNAL_ID,
      },
    });
    expect(knowledge.savedItems).toHaveLength(0);
  });

  it("maps knowledge persistence failures to a retryable application error", async () => {
    const journals = new FakeJournalRepository();
    journals.journalById = makeJournal();
    const knowledge = new FakeKnowledgeRepository();
    knowledge.saveError = new Error("database unavailable");
    const projector = new FakeProjector();

    const result = await promoteToKnowledge(
      {
        journals,
        knowledge,
        projector,
        ids: new SequenceIds([KNOWLEDGE_ID]),
        clock,
      },
      {
        journalId: JOURNAL_ID,
        kind: "note",
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

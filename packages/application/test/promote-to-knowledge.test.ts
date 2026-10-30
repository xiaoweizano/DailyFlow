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
  it("creates a knowledge item while preserving its journal and block source", async () => {
    const journals = new FakeJournalRepository();
    journals.journalById = makeJournal();
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

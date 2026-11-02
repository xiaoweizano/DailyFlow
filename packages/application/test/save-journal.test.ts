import { describe, expect, it } from "vitest";

import { saveJournal } from "../src/use-cases/save-journal.js";
import {
  FakeJournalRepository,
  FakeProjector,
  JOURNAL_DATE,
  JOURNAL_ID,
  JOURNAL_ENTITY_ID,
  NOW,
  NOW_TIMESTAMP,
  PROJECTED_HASH,
  PROJECTED_CONTENT_HASH,
  clock,
} from "./support.js";

const contentJson = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Deploy notes" }] }],
};

function createInput(expectedRevision: number | null = null) {
  return {
    journalId: JOURNAL_ID,
    journalDate: "2026-10-30",
    timezone: "Asia/Shanghai",
    title: "Deploy notes",
    contentJson,
    editorSchemaVersion: 1,
    projectionVersion: 1,
    expectedRevision,
    checkpoint: "explicit",
    tags: [" Work ", "work"],
  };
}

describe("saveJournal", () => {
  it("creates a first snapshot through the projector and atomic repository port", async () => {
    const journals = new FakeJournalRepository();
    const projector = new FakeProjector();
    const input = createInput();
    const inputBeforeSave = structuredClone(input);

    const result = await saveJournal({ journals, projector, clock }, input);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected saveJournal to succeed");
    }
    expect(result.value.revision).toBe(1);
    expect(journals.savedSnapshots).toHaveLength(1);
    expect(projector.inputs).toHaveLength(1);
    expect(projector.inputs[0]?.tags).toEqual(["Work", "work"]);
    expect(projector.inputs[0]?.searchContext).toMatchObject({
      ownerEntityId: JOURNAL_ID,
      entityType: "journal",
      title: "Deploy notes",
      localDate: JOURNAL_DATE,
      updatedAt: NOW_TIMESTAMP,
    });
    expect(journals.savedSnapshots[0]).toMatchObject({
      journalId: JOURNAL_ID,
      contentHash: PROJECTED_HASH,
      expectedRevision: null,
      checkpoint: "explicit",
      tags: ["work"],
      savedAt: NOW,
    });
    expect(input).toEqual(inputBeforeSave);
  });

  it("returns a conflict before projecting or saving a stale revision", async () => {
    const journals = new FakeJournalRepository();
    journals.saveState = {
      journalId: JOURNAL_ENTITY_ID,
      journalDate: JOURNAL_DATE,
      timezone: "Asia/Shanghai",
      revision: 3,
      title: "Deploy notes",
      contentHash: PROJECTED_CONTENT_HASH,
      projectionVersion: 1,
      tags: ["work"],
      updatedAt: NOW_TIMESTAMP,
    };
    const projector = new FakeProjector();

    const result = await saveJournal({ journals, projector, clock }, createInput(2));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        entity: "journal",
        expectedRevision: 2,
        actualRevision: 3,
      },
    });
    expect(projector.inputs).toHaveLength(0);
    expect(journals.savedSnapshots).toHaveLength(0);
  });

  it("does not increment revision when content and metadata are unchanged", async () => {
    const journals = new FakeJournalRepository();
    journals.saveState = {
      journalId: JOURNAL_ENTITY_ID,
      journalDate: JOURNAL_DATE,
      timezone: "Asia/Shanghai",
      revision: 3,
      title: "Deploy notes",
      contentHash: PROJECTED_CONTENT_HASH,
      projectionVersion: 1,
      tags: ["work"],
      updatedAt: NOW_TIMESTAMP,
    };
    const projector = new FakeProjector();

    const result = await saveJournal({ journals, projector, clock }, createInput(3));

    expect(result).toEqual({
      ok: true,
      value: {
        journalId: JOURNAL_ID,
        revision: 3,
        savedAt: NOW,
        contentHash: PROJECTED_HASH,
        versionCreated: false,
        searchIndexState: "ready",
      },
    });
    expect(journals.savedSnapshots).toHaveLength(0);
  });

  it("persists when journal metadata changes but projected content is unchanged", async () => {
    const journals = new FakeJournalRepository();
    journals.saveState = {
      journalId: JOURNAL_ENTITY_ID,
      journalDate: JOURNAL_DATE,
      timezone: "UTC",
      revision: 3,
      title: "Deploy notes",
      contentHash: PROJECTED_CONTENT_HASH,
      projectionVersion: 1,
      tags: ["work"],
      updatedAt: NOW_TIMESTAMP,
    };
    const projector = new FakeProjector();

    const result = await saveJournal({ journals, projector, clock }, createInput(3));

    expect(result.ok).toBe(true);
    expect(journals.savedSnapshots).toHaveLength(1);
    expect(journals.savedSnapshots[0]?.timezone).toBe("Asia/Shanghai");
  });

  it("maps repository failures without mutating the caller input", async () => {
    const journals = new FakeJournalRepository();
    journals.saveError = new Error("disk path must not leak");
    const projector = new FakeProjector();
    const input = createInput();
    const inputBeforeSave = structuredClone(input);

    const result = await saveJournal({ journals, projector, clock }, input);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_UNAVAILABLE",
        retryable: true,
      },
    });
    expect(input).toEqual(inputBeforeSave);
  });

  it("rejects invalid input before calling any port", async () => {
    const journals = new FakeJournalRepository();
    const projector = new FakeProjector();

    const result = await saveJournal(
      { journals, projector, clock },
      { ...createInput(), journalDate: "2026-02-30" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected saveJournal to reject the invalid date");
    }
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(projector.inputs).toHaveLength(0);
    expect(journals.savedSnapshots).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { annualTimelineDateRange } from "../src/queries/timeline-query.js";
import { completeTask } from "../src/use-cases/complete-task.js";
import { getJournal } from "../src/use-cases/get-journal.js";
import { restoreJournalVersion } from "../src/use-cases/restore-journal-version.js";
import {
  FakeJournalRepository,
  FakeTaskRepository,
  JOURNAL_ID,
  NOW,
  OTHER_JOURNAL_ID,
  SequenceIds,
  TASK_ID,
  clock,
  makeJournal,
  makeJournalVersion,
} from "./support.js";

describe("annualTimelineDateRange", () => {
  it("returns one natural-year range including leap day", () => {
    expect(annualTimelineDateRange(2024)).toEqual({
      from: "2024-01-01",
      to: "2024-12-31",
    });
  });

  it("rejects invalid years", () => {
    expect(() => annualTimelineDateRange(0)).toThrow(RangeError);
    expect(() => annualTimelineDateRange(2024.5)).toThrow(RangeError);
  });
});

describe("getJournal", () => {
  it("returns a revision-zero draft when the local date has no journal", async () => {
    const journals = new FakeJournalRepository();

    const result = await getJournal(
      { journals, ids: new SequenceIds([OTHER_JOURNAL_ID]), clock },
      {
        journalDate: "2026-10-30",
        timezone: "Asia/Shanghai",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected getJournal to return a draft");
    }
    expect(result.value.isPersisted).toBe(false);
    expect(result.value.journal.id).toBe(OTHER_JOURNAL_ID);
    expect(result.value.journal.revision).toBe(0);
    expect(result.value.journal.journalDate).toBe("2026-10-30");
  });

  it("returns the persisted journal for an existing date", async () => {
    const journals = new FakeJournalRepository();
    journals.journalById = makeJournal();

    const result = await getJournal(
      { journals, ids: new SequenceIds([OTHER_JOURNAL_ID]), clock },
      {
        journalDate: "2026-10-30",
        timezone: "Asia/Shanghai",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected getJournal to return the persisted journal");
    }
    expect(result.value.isPersisted).toBe(true);
    expect(result.value.journal.id).toBe(JOURNAL_ID);
  });
});

describe("restoreJournalVersion", () => {
  it("restores an existing version with current-revision protection", async () => {
    const journals = new FakeJournalRepository();
    journals.version = makeJournalVersion();

    const result = await restoreJournalVersion(
      { journals, clock },
      {
        journalId: JOURNAL_ID,
        versionRevision: 2,
        expectedCurrentRevision: 3,
      },
    );

    expect(result.ok).toBe(true);
    expect(journals.restoredInputs).toEqual([
      {
        journalId: JOURNAL_ID,
        versionRevision: 2,
        expectedCurrentRevision: 3,
        restoredAt: NOW,
      },
    ]);
  });

  it("does not restore a missing version", async () => {
    const journals = new FakeJournalRepository();

    const result = await restoreJournalVersion(
      { journals, clock },
      {
        journalId: JOURNAL_ID,
        versionRevision: 99,
        expectedCurrentRevision: 3,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected restoreJournalVersion to fail");
    }
    expect(result.error.code).toBe("NOT_FOUND");
    expect(journals.restoredInputs).toHaveLength(0);
  });
});

describe("completeTask", () => {
  it("delegates completion atomically with the injected clock time", async () => {
    const tasks = new FakeTaskRepository();

    const result = await completeTask(
      { tasks, clock },
      {
        taskId: TASK_ID,
        expectedRevision: 2,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected completeTask to succeed");
    }
    expect(result.value.status).toBe("done");
    expect(result.value.completedAt).toBe(NOW);
    expect(tasks.completion).toEqual({
      id: TASK_ID,
      completedAt: NOW,
      expectedRevision: 2,
    });
  });
});

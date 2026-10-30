import { describe, expect, it } from "vitest";

import {
  createContentDocument,
  createJournal,
  createJournalVersion,
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

describe("Journal", () => {
  it("creates an unsaved journal with an empty title", () => {
    const journal = createJournal(
      {
        journalDate: "2026-10-30",
        timezone: "Asia/Shanghai",
        title: "",
        content,
        projectionVersion: 1,
      },
      { ids, clock },
    );

    expect(journal.title).toBe("");
    expect(journal.journalDate).toBe("2026-10-30");
    expect(journal.revision).toBe(0);
    expect(journal.contentHash).toBeNull();
    expect(journal.createdAt).toBe("2026-10-30T03:20:11.123Z");
    expect(journal.projectionVersion).toBe(1);
  });

  it("rejects an impossible local date instead of rolling it into another day", () => {
    expect(() =>
      createJournal(
        {
          journalDate: "2026-02-30",
          timezone: "Asia/Shanghai",
          content,
          projectionVersion: 1,
        },
        { ids, clock },
      ),
    ).toThrow("Invalid LocalDate");
  });
});

describe("JournalVersion", () => {
  it("requires a persisted revision and canonical content hash", () => {
    const input = {
      journalId: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
      revision: 1,
      title: "",
      content,
      contentHash: "37ea0eaf881513383c7946fe8d45394d83c549ade33c85475476380fe2f3490d",
      projectionVersion: 1,
      changeSource: "autosave" as const,
    };

    const version = createJournalVersion(input, { ids, clock });

    expect(version.revision).toBe(1);
    expect(version.changeSource).toBe("autosave");
    expect(version.projectionVersion).toBe(1);
    expect(() => createJournalVersion({ ...input, revision: 0 }, { ids, clock })).toThrow(
      "positive",
    );
  });
});

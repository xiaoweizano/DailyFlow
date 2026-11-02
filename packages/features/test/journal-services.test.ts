import type {
  JournalRepository,
  JournalVersionSummary,
  SaveJournalSnapshot,
} from "@dailyflow/application";
import { createContentDocument, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import type { Revision } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { createJournalRuntimeServices } from "../src/journal/journal-services.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const nextId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c27");

function createRepository(): JournalRepository {
  return {
    getByDate: vi.fn(async () => null),
    getById: vi.fn(async () => null),
    getSaveState: vi.fn(async () => null),
    listSummaries: vi.fn(async () => ({ items: [], nextCursor: null })),
    saveSnapshot: vi.fn(async (input: SaveJournalSnapshot) => ({
      journalId: input.journalId,
      revision: 1 as Revision,
      savedAt: input.savedAt,
      contentHash: input.contentHash,
      versionCreated: true,
      searchIndexState: "ready" as const,
    })),
    listVersions: vi.fn(async () => ({
      items: [] as readonly JournalVersionSummary[],
      nextCursor: null,
    })),
    getVersion: vi.fn(async () => null),
    restoreVersion: vi.fn(),
    softDelete: vi.fn(async () => undefined),
  };
}

describe("journal runtime services", () => {
  it("routes reads through the getJournal use case", async () => {
    const services = createJournalRuntimeServices({
      journals: createRepository(),
      projector: {
        project: vi.fn(async () => ({
          contentMarkdown: "",
          contentPlainText: "",
          contentHash: "a".repeat(64) as never,
          excerpt: "",
          structuredBlocks: [],
          searchDocuments: [],
        })),
      },
      clock: { nowUtc: () => "2026-10-30T03:20:11.123Z" },
      ids: { nextId: () => nextId },
    });

    const result = await services.get({
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected journal lookup to succeed");
    }
    expect(result.value.isPersisted).toBe(false);
    expect(result.value.journal).toMatchObject({
      id: nextId,
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
      content: createContentDocument(1, { type: "doc", content: [] }),
      updatedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
    });
  });

  it("exposes history and restore operations without leaking storage adapters", async () => {
    const repository = createRepository();
    const services = createJournalRuntimeServices({
      journals: repository,
      projector: {
        project: vi.fn(async () => ({
          contentMarkdown: "",
          contentPlainText: "",
          contentHash: "a".repeat(64) as never,
          excerpt: "",
          structuredBlocks: [],
          searchDocuments: [],
        })),
      },
      clock: { nowUtc: () => "2026-10-30T03:20:11.123Z" },
      ids: { nextId: () => nextId },
    });

    await services.listVersions(journalId, { limit: 10 });
    await services.getVersion(journalId, 2);

    expect(repository.listVersions).toHaveBeenCalledWith(journalId, { limit: 10 });
    expect(repository.getVersion).toHaveBeenCalledWith(journalId, 2);
  });
});

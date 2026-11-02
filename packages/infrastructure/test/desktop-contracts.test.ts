import { PortError, type SaveJournalSnapshot } from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopJournalRepository } from "../src/desktop/desktop-journal-repository.js";
import { DesktopSearchPort } from "../src/desktop/desktop-search-port.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const CONTENT_HASH = parseContentHash(
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);
const SAVED_AT = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const journalDto = {
  id: JOURNAL_ID,
  journalDate: "2026-10-30",
  timezone: "Asia/Shanghai",
  title: "Deploy notes",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph" }],
  },
  contentMarkdown: "Deploy notes",
  contentPlainText: "Deploy notes",
  editorSchemaVersion: 1,
  projectionVersion: 1,
  contentHash: CONTENT_HASH,
  excerpt: "Deploy notes",
  status: "active",
  revision: 1,
  createdAt: SAVED_AT,
  updatedAt: SAVED_AT,
  deletedAt: null,
  tags: ["work"],
  structuredBlocks: [],
} as const;

function createInvoke(result: unknown): ReturnType<typeof vi.fn<TauriInvoke>> {
  return vi.fn<TauriInvoke>().mockResolvedValue(result);
}

function createJournalRepository(invoke: TauriInvoke): DesktopJournalRepository {
  return new DesktopJournalRepository({
    client: new TauriCommandClient(invoke),
    clock: { nowUtc: () => SAVED_AT },
  });
}

function makeSnapshot(expectedRevision: number | null): SaveJournalSnapshot {
  return {
    journalId: JOURNAL_ID,
    journalDate: parseLocalDate("2026-10-30"),
    timezone: "Asia/Shanghai",
    title: "Deploy notes",
    contentJson: { type: "doc", content: [] },
    editorSchemaVersion: 1,
    contentMarkdown: "Deploy notes",
    contentPlainText: "Deploy notes",
    contentHash: CONTENT_HASH,
    projectionVersion: 1,
    excerpt: "Deploy notes",
    expectedRevision,
    checkpoint: "explicit",
    tags: ["work"],
    structuredBlocks: [],
    searchDocuments: [],
    savedAt: SAVED_AT,
  };
}

describe("desktop Tauri contracts", () => {
  it("rejects a response with missing required fields", async () => {
    const invoke = createInvoke({ ...journalDto, revision: undefined });
    const journals = createJournalRepository(invoke);

    const error = await journals.getById(JOURNAL_ID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        fields: {
          revision: expect.any(String),
        },
      },
    });
  });

  it("maps Rust storage errors to application port errors", async () => {
    const invoke = vi.fn<TauriInvoke>().mockRejectedValue({
      code: "CONFLICT",
      message: "Journal revision conflict",
    });
    const journals = createJournalRepository(invoke);

    const error = await journals.getById(JOURNAL_ID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Journal revision conflict",
    });
  });

  it("maps save input and returns the persisted revision", async () => {
    const invoke = createInvoke({
      journalId: JOURNAL_ID,
      revision: 2,
      savedAt: SAVED_AT,
      contentHash: CONTENT_HASH,
      versionCreated: true,
      searchIndexState: "ready",
    });
    const journals = createJournalRepository(invoke);

    const saved = await journals.saveSnapshot(makeSnapshot(1));

    expect(invoke).toHaveBeenCalledWith("journal_save_snapshot", {
      input: expect.objectContaining({
        journalId: JOURNAL_ID,
        expectedRevision: 1,
        checkpoint: "explicit",
        contentHash: CONTENT_HASH,
      }),
    });
    expect(saved).toMatchObject({
      journalId: JOURNAL_ID,
      revision: 2,
      versionCreated: true,
    });
  });

  it("preserves the opaque pagination cursor returned by Rust", async () => {
    const invoke = createInvoke({
      items: [
        {
          id: JOURNAL_ID,
          journalDate: "2026-10-30",
          title: "Deploy notes",
          excerpt: "Deploy notes",
          revision: 1,
          updatedAt: SAVED_AT,
        },
      ],
      nextCursor: "rust-cursor-2",
    });
    const journals = createJournalRepository(invoke);

    const page = await journals.listSummaries({ cursor: "rust-cursor-1", limit: 2 });

    expect(invoke).toHaveBeenCalledWith("journal_list_summaries", {
      query: {
        cursor: "rust-cursor-1",
        limit: 2,
      },
    });
    expect(page.nextCursor).toBe("rust-cursor-2");
  });

  it("maps desktop search filters, results, and pagination", async () => {
    const invoke = createInvoke({
      items: [
        {
          entityType: "journal",
          entityId: JOURNAL_ID,
          title: "Deploy notes",
          snippet: "Deployed the service",
          localDate: "2026-10-30",
          score: 1.5,
        },
      ],
      nextCursor: "search-cursor-2",
      indexState: "stale",
    });
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const page = await search.query({
      text: "deploy",
      entityTypes: ["journal", "knowledge_item"],
      fromDate: parseLocalDate("2026-10-01"),
      toDate: parseLocalDate("2026-10-31"),
      cursor: "search-cursor-1",
      limit: 20,
    });

    expect(invoke).toHaveBeenCalledWith("search_query", {
      query: {
        text: "deploy",
        entityTypes: ["journal", "knowledge_item"],
        fromDate: "2026-10-01",
        toDate: "2026-10-31",
        cursor: "search-cursor-1",
        limit: 20,
      },
    });
    expect(page).toMatchObject({
      items: [
        {
          entityType: "journal",
          entityId: JOURNAL_ID,
          localDate: "2026-10-30",
          score: 1.5,
        },
      ],
      nextCursor: "search-cursor-2",
      indexState: "stale",
    });
  });

  it("maps invalid request payloads without invoking Tauri", async () => {
    const invoke = createInvoke([]);
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const error = await search.query({ text: 42 } as never).catch((reason: unknown) => reason);

    expect(invoke).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Desktop storage request is invalid",
      details: {
        fields: {
          "query.text": expect.any(String),
        },
      },
    });
  });

  it("reports desktop search rebuild as explicitly unavailable", async () => {
    const search = new DesktopSearchPort({ client: new TauriCommandClient(createInvoke([])) });

    const error = await search.rebuild().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      details: {
        retryable: false,
      },
    });
  });

  it("accepts an empty Tauri command response", async () => {
    const invoke = createInvoke(undefined);
    const journals = createJournalRepository(invoke);

    await expect(journals.softDelete(JOURNAL_ID, 1)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("journal_soft_delete", {
      journalId: JOURNAL_ID,
      expectedRevision: 1,
      deletedAt: SAVED_AT,
    });
  });

  it("uses the Tauri v2 IPC bridge when no invoke function is injected", async () => {
    const globals = globalThis as typeof globalThis & {
      __TAURI_INTERNALS__?: {
        readonly invoke: TauriInvoke;
      };
    };
    const original = globals.__TAURI_INTERNALS__;
    const invoke = createInvoke(journalDto);
    globals.__TAURI_INTERNALS__ = { invoke };

    try {
      const journal = await new TauriCommandClient().getJournalById(JOURNAL_ID);

      expect(invoke).toHaveBeenCalledWith("journal_get_by_id", {
        journalId: JOURNAL_ID,
      });
      expect(journal?.id).toBe(JOURNAL_ID);
    } finally {
      if (original === undefined) {
        delete globals.__TAURI_INTERNALS__;
      } else {
        globals.__TAURI_INTERNALS__ = original;
      }
    }
  });
});

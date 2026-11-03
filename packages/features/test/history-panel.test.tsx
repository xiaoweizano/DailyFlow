// @vitest-environment jsdom

import "./setup-dom.js";

import type { JournalVersionSummary, Page } from "@dailyflow/application";
import { parseEntityId, parseRevision, parseUtcTimestamp } from "@dailyflow/domain";
import { ok } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { HistoryPanel } from "../src/journal/history-panel.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");

const firstPage: readonly JournalVersionSummary[] = [
  {
    journalId,
    revision: parseRevision(3),
    title: "发布复盘",
    changeSource: "explicit",
    createdAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
  },
  {
    journalId,
    revision: parseRevision(2),
    title: "发布前检查",
    changeSource: "autosave",
    createdAt: parseUtcTimestamp("2026-10-30T02:20:11.123Z"),
  },
];

function createServices() {
  return {
    analytics: createAnalyticsServicesStub(),
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async (): Promise<Page<JournalVersionSummary>> => ({
        items: firstPage,
        nextCursor: "versions-2",
      })),
      getVersion: vi.fn(async () => ({
        id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c27"),
        journalId,
        revision: parseRevision(2),
        title: "发布前检查",
        content: {
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "旧版本正文" }] }],
          },
        },
        contentHash: "b".repeat(64) as never,
        projectionVersion: 1,
        changeSource: "autosave" as const,
        createdAt: parseUtcTimestamp("2026-10-30T02:20:11.123Z"),
      })),
      restore: vi.fn(async () =>
        ok({
          journalId,
          revision: parseRevision(4),
          savedAt: parseUtcTimestamp("2026-10-30T04:20:11.123Z"),
          contentHash: "c".repeat(64) as never,
          versionCreated: true,
          searchIndexState: "ready" as const,
        }),
      ),
    },
    search: {
      query: vi.fn(),
      rebuild: vi.fn(),
    },
    lifecycle: {
      register: vi.fn(() => () => undefined),
      flushAll: vi.fn(async () => true),
    },
    attachments: {
      add: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "STORAGE_UNAVAILABLE" as const,
          retryable: true,
        },
      })),
      read: vi.fn(async () => new Uint8Array()),
    },
    tasks: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      complete: vi.fn(),
      reopen: vi.fn(),
      update: vi.fn(),
    },
    timeline: {
      getCalendar: vi.fn(async () => []),
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  };
}

function renderHistoryPanel(services: ReturnType<typeof createServices>) {
  const onRestored = vi.fn();
  render(
    <AppServicesProvider services={services}>
      <HistoryPanel
        journalId={journalId}
        currentRevision={3}
        onRestored={onRestored}
        onClose={vi.fn()}
      />
    </AppServicesProvider>,
  );

  return { services, onRestored };
}

describe("HistoryPanel", () => {
  it("loads version pages and appends the next page", async () => {
    const user = userEvent.setup();
    const { services } = renderHistoryPanel(createServices());

    expect(await screen.findByText(/发布复盘/u)).toBeTruthy();
    expect(screen.getByText(/发布前检查/u)).toBeTruthy();
    expect(services.journal.listVersions).toHaveBeenCalledWith(journalId, { limit: 20 });

    services.journal.listVersions.mockResolvedValueOnce({
      items: [
        {
          journalId,
          revision: parseRevision(1),
          title: "初始记录",
          changeSource: "autosave",
          createdAt: parseUtcTimestamp("2026-10-30T01:20:11.123Z"),
        },
      ],
      nextCursor: null,
    });

    await user.click(screen.getByRole("button", { name: "加载更多版本" }));

    expect(await screen.findByText(/初始记录/u)).toBeTruthy();
    expect(services.journal.listVersions).toHaveBeenLastCalledWith(journalId, {
      cursor: "versions-2",
      limit: 20,
    });
  });

  it("previews a selected version and restores it against the current revision", async () => {
    const user = userEvent.setup();
    const { services, onRestored } = renderHistoryPanel(createServices());

    await user.click(await screen.findByRole("button", { name: /版本 2/u }));

    expect(await screen.findByText("旧版本正文")).toBeTruthy();
    expect(services.journal.getVersion).toHaveBeenCalledWith(journalId, 2);

    await user.click(screen.getByRole("button", { name: "恢复此版本" }));

    await waitFor(() =>
      expect(services.journal.restore).toHaveBeenCalledWith({
        journalId,
        versionRevision: 2,
        expectedCurrentRevision: 3,
      }),
    );
    expect(onRestored).toHaveBeenCalledWith(
      expect.objectContaining({
        journalId,
        revision: 4,
        versionCreated: true,
      }),
    );
  });
});

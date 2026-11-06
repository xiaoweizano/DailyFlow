// @vitest-environment jsdom

import "./setup-dom.js";

import type { SavedJournalSnapshot, SearchHit, SearchResultPage } from "@dailyflow/application";
import { parseEntityId, parseLocalDate, parseUtcTimestamp } from "@dailyflow/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { SearchCommand } from "../src/search/search-command.js";
import { SearchPage } from "../src/search/search-page.js";
import { searchResultPath } from "../src/search/search-result-path.js";

const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");
const hit: SearchHit = {
  entityType: "journal",
  entityId: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26"),
  title: "Rollback 发布故障",
  snippet: "执行 rollback 后服务恢复。",
  localDate: parseLocalDate("2026-10-30"),
  score: 42,
};

function createServices(
  result: SearchResultPage = {
    items: [hit],
    nextCursor: null,
    indexState: "stale",
  },
): AppRuntimeServices {
  return {
    ...createRuntimeSettingsStub(),
    analytics: createAnalyticsServicesStub(),
    backups: createBackupServicesStub(),
    exports: createExportServicesStub(),
    imports: createImportServicesStub(),
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      create: vi.fn(),
      promote: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(async (): Promise<{ ok: true; value: SavedJournalSnapshot }> => {
        throw new Error("not used");
      }),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async () => ({ items: [], nextCursor: null })),
      getVersion: vi.fn(async () => null),
      restore: vi.fn(),
    },
    search: {
      query: vi.fn(async () => result),
      rebuild: vi.fn(async () => ({
        indexedCount: 12,
        completedAt: NOW,
        status: "completed" as const,
      })),
    },
    lifecycle: {
      register: vi.fn(() => () => undefined),
      flushAll: vi.fn(async () => true),
    },
    attachments: {
      add: vi.fn(async () => {
        throw new Error("not used");
      }) as unknown as AppRuntimeServices["attachments"]["add"],
      read: vi.fn(async () => new Uint8Array()),
    },
    tasks: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      create: vi.fn(),
      complete: vi.fn(),
      reopen: vi.fn(),
      update: vi.fn(),
    },
    timeline: {
      getCalendar: vi.fn(async () => []),
      getAnnualActivity: vi.fn(async () => []),
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  };
}

function renderSearch(services: AppRuntimeServices, initialEntry = "/search?q=rollback"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppServicesProvider services={services}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

function LocationDisplay(): React.JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe("global search", () => {
  it("shows highlighted results while the stale index remains usable", async () => {
    const services = createServices();
    const user = userEvent.setup();
    renderSearch(services);

    expect(await screen.findByRole("link", { name: /Rollback 发布故障/u })).toHaveAttribute(
      "href",
      "/journal/2026-10-30",
    );
    expect(screen.getByText("rollback")).toHaveClass("bg-warning/25");
    expect(screen.getByText("索引待重建")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "重建索引" }));

    expect(services.search.rebuild).toHaveBeenCalledOnce();
    expect(await screen.findByText("索引已就绪")).toBeTruthy();
  });

  it("keeps failed index results accessible and shows the recovery action", async () => {
    renderSearch(
      createServices({
        items: [hit],
        nextCursor: null,
        indexState: "failed",
      }),
    );

    expect(await screen.findByRole("link", { name: /Rollback 发布故障/u })).toBeTruthy();
    expect(screen.getByText("索引不可用，可尝试重建")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重建索引" })).toBeTruthy();
  });

  it.each([
    [hit, "/journal/2026-10-30"],
    [
      { ...hit, entityType: "knowledge_item" as const, localDate: null },
      `/knowledge/${hit.entityId}`,
    ],
    [{ ...hit, entityType: "task" as const, localDate: null }, `/tasks?task=${hit.entityId}`],
    [
      { ...hit, entityType: "structured_block" as const },
      `/journal/2026-10-30?block=${hit.entityId}`,
    ],
  ])("routes %s results to the matching workspace", (result, path) => {
    expect(searchResultPath(result)).toBe(path);
  });

  it("supports keyboard selection, Enter navigation, and Escape dismissal", async () => {
    const services = createServices();
    const user = userEvent.setup();
    function Harness(): React.JSX.Element {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            打开搜索
          </button>
          <SearchCommand open={open} onOpenChange={setOpen} />
          <LocationDisplay />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppServicesProvider services={services}>
          <Harness />
        </AppServicesProvider>
      </MemoryRouter>,
    );

    const input = screen.getByRole("combobox", { name: "搜索关键词" });
    await user.type(input, "rollback");
    await screen.findByRole("option", { name: /Rollback 发布故障/u });
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/journal/2026-10-30"),
    );

    await user.click(screen.getByRole("button", { name: "打开搜索" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

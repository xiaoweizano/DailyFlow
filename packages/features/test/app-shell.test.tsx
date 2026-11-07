// @vitest-environment jsdom

import "./setup-dom.js";

import {
  DEFAULT_USER_PREFERENCES,
  type Page,
  type SavedJournalSnapshot,
  type StoredAttachment,
} from "@dailyflow/application";
import type { AppError, Result } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { AppShell } from "../src/app-shell.js";

function createServices(): AppRuntimeServices {
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
      promote: vi.fn(async (): Promise<Result<never, AppError>> => {
        throw new Error("not used");
      }),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(async (): Promise<Result<SavedJournalSnapshot, AppError>> => {
        throw new Error("not used");
      }),
      list: vi.fn(async (): Promise<Page<never>> => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async (): Promise<Page<never>> => ({ items: [], nextCursor: null })),
      getVersion: vi.fn(async () => null),
      restore: vi.fn(),
    },
    search: {
      query: vi.fn(async () => ({ items: [], nextCursor: null, indexState: "ready" as const })),
      rebuild: vi.fn(),
    },
    lifecycle: {
      register: vi.fn(() => () => undefined),
      flushAll: vi.fn(async () => true),
    },
    attachments: {
      add: vi.fn(async (): Promise<Result<StoredAttachment, AppError>> => {
        throw new Error("not used");
      }),
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

function renderShell(locale: "zh-CN" | "en-US" = "zh-CN"): void {
  const baseServices = createServices();
  const services: AppRuntimeServices = {
    ...baseServices,
    settings: {
      ...baseServices.settings,
      load: async () => ({
        preferences: {
          ...DEFAULT_USER_PREFERENCES,
          locale,
        },
        warning: null,
      }),
    },
  };

  render(
    <MemoryRouter initialEntries={["/"]}>
      <AppServicesProvider services={services}>
        <Routes>
          <Route element={<AppShell platform="web" storageLabel="IndexedDB" version="0.1.0" />}>
            <Route index element={<p>工作台</p>} />
          </Route>
        </Routes>
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("application shell search shortcut", () => {
  it("translates navigation and shell chrome for the persisted language", async () => {
    renderShell("en-US");

    expect(await screen.findByRole("link", { name: "Workbench" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Daily Journal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(
      screen.getByRole("searchbox", { name: "Search journals, knowledge, and tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open today's journal" })).toBeInTheDocument();
    expect(screen.getByText("Local data ready")).toBeInTheDocument();
    expect(screen.getByText("Not edited yet")).toBeInTheDocument();
  });

  it("keeps runtime storage details out of the persistent shell chrome", () => {
    renderShell();

    expect(screen.getByText("本地数据已就绪")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute("href", "/help");
    expect(screen.queryByText(/IndexedDB/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Web ·/)).not.toBeInTheDocument();
  });

  it("opens the global search command with / and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.keyboard("/");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "搜索关键词" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not intercept / while typing in an input", async () => {
    const user = userEvent.setup();
    renderShell();

    const input = screen.getByRole("searchbox", { name: "搜索日志、知识和任务" });
    await user.click(input);
    await user.type(input, "/");

    expect(input).toHaveValue("/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

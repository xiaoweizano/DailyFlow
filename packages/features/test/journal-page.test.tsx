// @vitest-environment jsdom

import "./setup-dom.js";

import {
  DEFAULT_USER_PREFERENCES,
  type SavedJournalSnapshot,
  type StoredAttachment,
} from "@dailyflow/application";
import { createJournal, parseEntityId, parseRevision, parseUtcTimestamp } from "@dailyflow/domain";
import { ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { JournalPage } from "../src/journal/journal-page.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");

function createServices(initialText = "原有内容") {
  const journal = createJournal(
    {
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
      title: "",
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              ...(initialText ? { content: [{ type: "text" as const, text: initialText }] } : {}),
            },
          ],
        },
      },
      projectionVersion: 1,
    },
    {
      ids: { nextId: () => journalId },
      clock: { nowUtc: () => "2026-10-30T03:20:11.123Z" },
    },
  );

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
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(async () => ok({ journal, isPersisted: false })),
      save: vi.fn(async (input: unknown): Promise<Result<SavedJournalSnapshot, AppError>> => {
        const expectedRevision = (input as { expectedRevision: number | null }).expectedRevision;
        return ok({
          journalId,
          revision: parseRevision((expectedRevision ?? 0) + 1),
          savedAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
          contentHash: "a".repeat(64) as never,
          versionCreated: true,
          searchIndexState: "ready" as const,
        });
      }),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async () => ({ items: [], nextCursor: null })),
      getVersion: vi.fn(async () => null),
      restore: vi.fn(),
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
      add: vi.fn(async (input: unknown): Promise<Result<StoredAttachment, AppError>> => {
        const { displayName } = input as { displayName: string };
        return ok({
          attachment: {
            id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c28"),
            blobId: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29"),
            ownerType: "journal",
            ownerId: journalId,
            displayName,
            altText: "",
            isInline: true,
            sortOrder: 0,
            mimeType: "image/png",
            byteSize: 11,
            storageKind: "web-blob",
            storageKey: "0198e2f4-7e33-7c70-a8b2-18c1520f9c29",
            sha256: "a".repeat(64) as never,
            createdAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
            deletedAt: null,
          },
          contentHash: "a".repeat(64) as never,
          byteSize: 11,
        });
      }),
      read: vi.fn(async () => new TextEncoder().encode("image bytes")),
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

function renderJournalPage(services: ReturnType<typeof createServices>, strict = false) {
  const page = (
    <MemoryRouter initialEntries={["/journal/2026-10-30"]}>
      <AppServicesProvider services={services}>
        <JournalPage date="2026-10-30" />
      </AppServicesProvider>
    </MemoryRouter>
  );

  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("JournalPage", () => {
  it("starts an empty journal with a template chooser and remembers the selected template", async () => {
    localStorage.clear();
    const services = createServices("");
    const user = userEvent.setup();
    renderJournalPage(services);

    expect(await screen.findByRole("heading", { name: "选择日志模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /空白日志/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /日报/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /周报/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /问题排查/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /复盘/u })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /日报/u }));

    const editor = await screen.findByLabelText("日志正文");
    expect(editor).toHaveTextContent("今日完成");
    expect(JSON.parse(localStorage.getItem("dailyflow.journalTemplates.v1") ?? "{}")).toMatchObject(
      {
        recentTemplateIds: ["daily"],
      },
    );
  });

  it("turns typed Markdown headings into heading nodes before autosave", async () => {
    const services = createServices("");
    const user = userEvent.setup();
    renderJournalPage(services);

    await screen.findByRole("heading", { name: "选择日志模板" });
    await user.click(screen.getByRole("button", { name: /空白日志/u }));
    const editor = await screen.findByLabelText("日志正文");
    await user.click(editor);
    await user.keyboard("## 标题");

    await waitFor(() => expect(services.journal.save).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    });
    const saveInput = services.journal.save.mock.calls[0]?.[0] as
      { contentJson: { content?: readonly unknown[] } } | undefined;
    expect(saveInput?.contentJson.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "标题" }],
    });
  });

  it("uses the persisted autosave interval for journal edits", async () => {
    const services = createServices();
    services.settings.load = vi.fn(async () => ({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        autosaveIntervalMs: 1200,
      },
      warning: null,
    }));
    renderJournalPage(services);

    await waitFor(() => expect(services.settings.load).toHaveBeenCalledOnce());
    const editor = await screen.findByLabelText("日志正文");

    const user = userEvent.setup();
    await user.click(editor);
    await user.keyboard(" 使用自定义间隔");

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(services.journal.save).not.toHaveBeenCalled();

    await waitFor(() => expect(services.journal.save).toHaveBeenCalledOnce(), {
      timeout: 500,
    });
  });

  it("loads a journal and autosaves edits after the debounce", async () => {
    const services = createServices();
    const user = userEvent.setup();
    renderJournalPage(services);

    const editor = await screen.findByLabelText("日志正文");
    expect(editor.textContent).toContain("原有内容");

    await user.click(editor);
    await user.keyboard(" 新增记录");

    await waitFor(() => expect(services.journal.save).toHaveBeenCalledTimes(1), {
      timeout: 2_000,
    });
    expect(services.journal.save.mock.calls[0]?.[0]).toMatchObject({
      journalId,
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
      editorSchemaVersion: 2,
      expectedRevision: null,
      checkpoint: "autosave",
    });
    expect(await screen.findByText(/已保存/u)).toBeTruthy();
  });

  it("creates an explicit checkpoint when saving from the toolbar", async () => {
    const services = createServices();
    const user = userEvent.setup();
    renderJournalPage(services);

    const title = await screen.findByRole("textbox", { name: "日志标题" });
    await user.type(title, "显式保存版本");
    await user.click(screen.getByRole("button", { name: "立即保存" }));

    await waitFor(() => expect(services.journal.save).toHaveBeenCalledTimes(1));
    expect(services.journal.save.mock.calls[0]?.[0]).toMatchObject({
      checkpoint: "explicit",
    });
  });

  it("shows save errors without discarding the current draft", async () => {
    const services = createServices();
    const user = userEvent.setup();
    services.journal.save.mockResolvedValue({
      ok: false,
      error: {
        code: "STORAGE_UNAVAILABLE",
        retryable: true,
      },
    });
    renderJournalPage(services);

    const editor = await screen.findByLabelText("日志正文");
    await user.click(editor);
    await user.keyboard(" 不能丢失的内容");

    expect(await screen.findByText("保存失败", {}, { timeout: 2_000 })).toBeTruthy();
    expect(editor.textContent).toContain("不能丢失的内容");
  });

  it("changes the title and keeps the save status visible", async () => {
    const services = createServices();
    const user = userEvent.setup();
    renderJournalPage(services);

    const title = await screen.findByRole("textbox", { name: "日志标题" });
    await user.type(title, "发布复盘");

    expect((title as HTMLInputElement).value).toBe("发布复盘");
    expect(screen.getByRole("status").textContent).toMatch(/未保存|正在保存|已保存/u);
  });

  it("tracks title changes when mounted in StrictMode", async () => {
    const services = createServices();
    const user = userEvent.setup();
    renderJournalPage(services, true);

    const title = await screen.findByRole("textbox", { name: "日志标题" });
    await user.type(title, "发布复盘");

    expect(await screen.findByText("有未保存更改")).toBeTruthy();
    await waitFor(() => expect(services.journal.save).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    });
  });

  it("stores an uploaded image and inserts only its stable attachment ID", async () => {
    const services = createServices();
    const user = userEvent.setup();
    renderJournalPage(services);

    const file = new File([new TextEncoder().encode("image bytes")], "diagram.png", {
      type: "image/png",
    });
    await user.upload(await screen.findByLabelText("选择附件"), file);

    await waitFor(() => expect(services.attachments.add).toHaveBeenCalledTimes(1));
    expect(services.attachments.add.mock.calls[0]?.[0]).toMatchObject({
      ownerType: "journal",
      ownerId: journalId,
      displayName: "diagram.png",
      mimeType: "image/png",
      isInline: true,
    });
    expect(await screen.findByRole("img", { name: "diagram.png" })).toBeTruthy();
  });

  it("renders journal controls in English when the persisted locale is en-US", async () => {
    const services = createServices();
    services.settings.load = vi.fn(async () => ({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        locale: "en-US" as const,
      },
      warning: null,
    }));
    renderJournalPage(services);

    expect(await screen.findByRole("button", { name: "Previous day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Journal content" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Template" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom

import "./setup-dom.js";

import type { SavedJournalSnapshot } from "@dailyflow/application";
import { createJournal, parseEntityId, parseRevision, parseUtcTimestamp } from "@dailyflow/domain";
import { ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppServicesProvider } from "../src/app-services-provider.js";
import { JournalPage } from "../src/journal/journal-page.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");

function createServices() {
  const journal = createJournal(
    {
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
      title: "",
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "原有内容" }] }],
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
  };
}

function renderJournalPage(services: ReturnType<typeof createServices>) {
  return render(
    <MemoryRouter initialEntries={["/journal/2026-10-30"]}>
      <AppServicesProvider services={services}>
        <JournalPage date="2026-10-30" />
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("JournalPage", () => {
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
      expectedRevision: null,
      checkpoint: "autosave",
    });
    expect(await screen.findByText(/已保存/u)).toBeTruthy();
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
});

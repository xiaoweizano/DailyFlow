// @vitest-environment jsdom

import "./setup-dom.js";

import type { SavedJournalSnapshot, StoredAttachment } from "@dailyflow/application";
import { createJournal, parseEntityId, parseRevision, parseUtcTimestamp } from "@dailyflow/domain";
import type { TiptapJsonNode } from "@dailyflow/editor";
import { ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { JournalPage } from "../src/journal/journal-page.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const attachmentId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c28");

function createServices(content?: TiptapJsonNode) {
  const journal = createJournal(
    {
      journalDate: "2026-11-05",
      timezone: "Asia/Shanghai",
      title: "块编辑测试",
      content: {
        schemaVersion: 2,
        doc: content ?? {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "起始内容" }] }],
        },
      },
      projectionVersion: 1,
    },
    {
      ids: { nextId: () => journalId },
      clock: { nowUtc: () => "2026-11-05T03:20:11.123Z" },
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
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(async () => ok({ journal, isPersisted: true })),
      save: vi.fn(async (input: unknown): Promise<Result<SavedJournalSnapshot, AppError>> => {
        const expectedRevision = (input as { expectedRevision: number | null }).expectedRevision;
        return ok({
          journalId,
          revision: parseRevision((expectedRevision ?? 0) + 1),
          savedAt: parseUtcTimestamp("2026-11-05T03:20:11.123Z"),
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
      add: vi.fn(async (): Promise<Result<StoredAttachment, AppError>> =>
        ok({
          attachment: {
            id: attachmentId,
            blobId: attachmentId,
            ownerType: "journal",
            ownerId: journalId,
            displayName: "diagram.png",
            altText: "diagram.png",
            isInline: true,
            sortOrder: 0,
            mimeType: "image/png",
            byteSize: 11,
            storageKind: "web-blob",
            storageKey: attachmentId,
            sha256: "a".repeat(64) as never,
            createdAt: parseUtcTimestamp("2026-11-05T03:20:11.123Z"),
            deletedAt: null,
          },
          contentHash: "a".repeat(64) as never,
          byteSize: 11,
        }),
      ),
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
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  };
}

function renderJournal(content?: TiptapJsonNode) {
  const services = createServices(content);
  render(
    <MemoryRouter initialEntries={["/journal/2026-11-05"]}>
      <AppServicesProvider services={services}>
        <JournalPage date="2026-11-05" />
      </AppServicesProvider>
    </MemoryRouter>,
  );
  return services;
}

describe("Journal editor blocks", () => {
  it("inserts a three-column table from the slash menu", async () => {
    const services = renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    const editor = await screen.findByLabelText("日志正文");

    await user.click(editor);
    await user.keyboard("/table");
    await user.click(await screen.findByRole("menuitem", { name: "表格" }));

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);

    await waitFor(
      () => {
        const input = services.journal.save.mock.calls.at(-1)?.[0] as
          { contentJson?: { content?: readonly { type?: string }[] } } | undefined;
        expect(input?.contentJson?.content?.some((node) => node.type === "table")).toBe(true);
      },
      { timeout: 2_000 },
    );
  });

  it("renders heading positions in the document outline", async () => {
    renderJournal({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "问题定位" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "排查步骤" }],
        },
      ],
    });

    const outline = await screen.findByRole("complementary", { name: "文档大纲" });
    expect(within(outline).getByRole("button", { name: "问题定位" })).toBeInTheDocument();
    expect(within(outline).getByRole("button", { name: "排查步骤" })).toBeInTheDocument();
  });

  it("uploads images through the slash menu and inserts only attachment metadata", async () => {
    const services = renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    const editor = await screen.findByLabelText("日志正文");

    await user.click(editor);
    await user.keyboard("/image");
    await user.click(await screen.findByRole("menuitem", { name: "图片" }));

    const file = new File([new TextEncoder().encode("image bytes")], "diagram.png", {
      type: "image/png",
    });
    await user.upload(await screen.findByLabelText("选择图片"), file);

    await waitFor(() => expect(services.attachments.add).toHaveBeenCalledOnce());
    expect(await screen.findByRole("img", { name: "diagram.png" })).toBeInTheDocument();
    const attachment = editor.querySelector("[data-attachment-id]");
    expect(attachment).toHaveAttribute("data-attachment-id", attachmentId);
    expect(attachment?.innerHTML).not.toContain("data:image");
  });
});

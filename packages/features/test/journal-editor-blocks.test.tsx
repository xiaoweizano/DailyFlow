// @vitest-environment jsdom

import "./setup-dom.js";

import type { SavedJournalSnapshot, StoredAttachment } from "@dailyflow/application";
import {
  createJournal,
  createKnowledgeItem,
  parseEntityId,
  parseRevision,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import type * as EditorModule from "@dailyflow/editor";
import { ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { JournalPage } from "../src/journal/journal-page.js";

type TiptapJsonNode = EditorModule.TiptapJsonNode;

vi.mock("@dailyflow/editor", async (importOriginal) => {
  const actual = await importOriginal<typeof EditorModule>();
  return {
    ...actual,
    renderMermaidToSvg: vi.fn(async () => '<svg aria-label="Mermaid diagram"></svg>'),
  };
});

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const attachmentId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c28");
const knowledgeId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29");

function promotedKnowledge() {
  return createKnowledgeItem(
    {
      kind: "note",
      title: "块编辑测试",
      content: {
        schemaVersion: 2,
        doc: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "沉淀内容" }] }],
        },
      },
      projectionVersion: 1,
      sourceJournalId: journalId,
    },
    {
      ids: { nextId: () => knowledgeId },
      clock: { nowUtc: () => "2026-11-05T03:20:11.123Z" },
    },
  );
}

interface JournalServiceOptions {
  readonly isPersisted?: boolean;
  readonly title?: string;
}

function createServices(content?: TiptapJsonNode, options: JournalServiceOptions = {}) {
  const journal = createJournal(
    {
      journalDate: "2026-11-05",
      timezone: "Asia/Shanghai",
      title: options.title ?? "块编辑测试",
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
      create: vi.fn(),
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(async () => ok({ journal, isPersisted: options.isPersisted ?? true })),
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
      getAnnualActivity: vi.fn(async () => []),
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  };
}

function renderJournal(content?: TiptapJsonNode, options: JournalServiceOptions = {}) {
  const services = createServices(content, options);
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
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts an empty journal with templates and focuses the body after selection", async () => {
    const user = userEvent.setup();
    renderJournal(
      { type: "doc", content: [{ type: "paragraph" }] },
      { isPersisted: false, title: "" },
    );

    expect(await screen.findByRole("heading", { name: "选择日志模板" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /问题排查/ }));

    const editor = await screen.findByLabelText("日志正文");
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("focuses the journal body when the blank template is selected", async () => {
    const user = userEvent.setup();
    renderJournal(
      { type: "doc", content: [{ type: "paragraph" }] },
      { isPersisted: false, title: "" },
    );

    await screen.findByRole("heading", { name: "选择日志模板" });
    await user.click(screen.getByRole("button", { name: /空白日志/ }));

    const editor = await screen.findByLabelText("日志正文");
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("persists the selected template as structured Tiptap JSON", async () => {
    const user = userEvent.setup();
    const services = renderJournal(
      { type: "doc", content: [{ type: "paragraph" }] },
      { isPersisted: false, title: "" },
    );

    await screen.findByRole("heading", { name: "选择日志模板" });
    await user.click(screen.getByRole("button", { name: /问题排查/ }));

    await waitFor(() => {
      const input = services.journal.save.mock.calls.at(-1)?.[0] as
        | {
            contentJson?: {
              content?: readonly { type?: string; content?: readonly { text?: string }[] }[];
            };
          }
        | undefined;
      const headings = input?.contentJson?.content?.filter((node) => node.type === "heading");
      expect(headings?.map((heading) => heading.content?.[0]?.text)).toContain("问题现象");
    });
  });

  it("shows one cursor insertion control without a visible six-dot drag handle", async () => {
    renderJournal({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
        { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
      ],
    });

    const editor = await screen.findByLabelText("日志正文");
    await userEvent.click(editor);

    expect(await screen.findByRole("button", { name: "在光标处插入内容" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("⠿");
  });

  it("opens the insertion menu from the plus control at the current block", async () => {
    renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    const editor = await screen.findByLabelText("日志正文");

    await user.click(editor);
    await user.keyboard("正文");
    await user.click(await screen.findByRole("button", { name: "在光标处插入内容" }));

    await user.click(await screen.findByRole("menuitem", { name: "二级标题" }));

    const headings = editor.querySelectorAll("h2");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("正文");
  });

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

  it("inserts an editable-looking math block from the slash menu", async () => {
    renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    const editor = await screen.findByLabelText("日志正文");

    await user.click(editor);
    await user.keyboard("/formula");
    await user.click(await screen.findByRole("menuitem", { name: "数学公式" }));

    expect(document.querySelector("[data-type='block-math']")).not.toBeNull();
  });

  it("inserts a Mermaid diagram from the slash menu", async () => {
    renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    const editor = await screen.findByLabelText("日志正文");

    await user.click(editor);
    await user.keyboard("/mermaid");
    await user.click(await screen.findByRole("menuitem", { name: "Mermaid 图表" }));

    expect(document.querySelector("[data-type='mermaid-block']")).not.toBeNull();
  });

  it("promotes the whole saved journal into knowledge", async () => {
    const services = renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    await screen.findByLabelText("日志正文");
    const item = promotedKnowledge();
    services.knowledge.promote.mockResolvedValue(ok(item));

    await user.click(screen.getByRole("button", { name: "沉淀整篇日志" }));
    expect(await screen.findByRole("dialog", { name: "保存为知识" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存到知识库" }));

    await waitFor(() =>
      expect(services.knowledge.promote).toHaveBeenCalledWith({
        journalId,
        kind: "note",
        title: "块编辑测试",
      }),
    );
    expect(await screen.findByRole("link", { name: "打开知识项" })).toHaveAttribute(
      "href",
      `/knowledge/${knowledgeId}`,
    );
  });

  it("inserts a structured block and promotes the selected block", async () => {
    const services = renderJournal({ type: "doc", content: [{ type: "paragraph" }] });
    const user = userEvent.setup();
    const editor = await screen.findByLabelText("日志正文");
    const item = promotedKnowledge();
    services.knowledge.promote.mockResolvedValue(ok(item));

    await user.click(editor);
    await user.keyboard("/structured");
    await user.click(await screen.findByRole("menuitem", { name: "结构化块" }));

    const block = await waitFor(() => {
      const element = document.querySelector<HTMLElement>("[data-type='structuredBlock']");
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    await user.click(block);
    await user.click(await screen.findByRole("button", { name: "沉淀当前块" }));
    await user.click(screen.getByRole("button", { name: "保存到知识库" }));

    await waitFor(() =>
      expect(services.knowledge.promote).toHaveBeenCalledWith(
        expect.objectContaining({
          journalId,
          sourceBlockId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
          ),
        }),
      ),
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

  it("adds a full-width-space Markdown heading to the document outline", async () => {
    const user = userEvent.setup();
    renderJournal({ type: "doc", content: [{ type: "paragraph" }] });

    const editor = await screen.findByLabelText("日志正文");
    await user.click(editor);
    await user.keyboard("##　你好");

    expect(editor.querySelector("h2")).toHaveTextContent("你好");
    const outline = await screen.findByRole("complementary", { name: "文档大纲" });
    expect(await within(outline).findByRole("button", { name: "你好" })).toBeInTheDocument();
  });

  it("opens and closes the responsive document outline drawer", async () => {
    const user = userEvent.setup();
    renderJournal({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "移动端大纲" }],
        },
      ],
    });

    const editor = await screen.findByLabelText("日志正文");
    await user.click(screen.getByRole("button", { name: "打开文档大纲" }));

    const dialog = await screen.findByRole("dialog", { name: "文档大纲" });
    expect(within(dialog).getByRole("button", { name: "移动端大纲" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "文档大纲" })).not.toBeInTheDocument(),
    );
    expect(editor).toBeInTheDocument();
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

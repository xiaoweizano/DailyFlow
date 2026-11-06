// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  JournalLookup,
  Page,
  SavedJournalSnapshot,
  StoredAttachment,
} from "@dailyflow/application";
import {
  createJournal,
  createKnowledgeItem,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type KnowledgeItem,
  type KnowledgeKind,
} from "@dailyflow/domain";
import { ok, type AppError, type Result } from "@dailyflow/shared";
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
import { KnowledgeDetailPage } from "../src/knowledge/knowledge-detail.js";
import { KnowledgePage } from "../src/knowledge/knowledge-page.js";
import { KnowledgePromotionDialog } from "../src/knowledge/knowledge-promotion-dialog.js";
import type {
  KnowledgeDetail,
  KnowledgeRuntimeServices,
} from "../src/knowledge/knowledge-services.js";

const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const BLOCK_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c40");
const KNOWLEDGE_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c41");
const SOLUTION_KNOWLEDGE_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c42");
const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const journal = createJournal(
  {
    journalDate: "2026-10-30",
    timezone: "Asia/Shanghai",
    title: "发布故障复盘",
    content: {
      schemaVersion: 1,
      doc: {
        type: "doc",
        content: [
          {
            type: "structuredBlock",
            attrs: {
              id: BLOCK_ID,
              blockType: "solution",
              schemaVersion: 1,
              data: { text: "回滚不健康的发布版本。" },
            },
          },
        ],
      },
    },
    projectionVersion: 1,
  },
  {
    ids: { nextId: () => JOURNAL_ID },
    clock: { nowUtc: () => NOW },
  },
);

function makeKnowledgeItem(kind: KnowledgeKind, title: string, id = KNOWLEDGE_ID): KnowledgeItem {
  return {
    ...createKnowledgeItem(
      {
        kind,
        title,
        content: {
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "回滚后服务恢复，记录检查清单。" }],
              },
            ],
          },
        },
        projectionVersion: 1,
        summary: "部署失败时先保护现有流量。",
        sourceJournalId: JOURNAL_ID,
        sourceBlockId: BLOCK_ID,
      },
      {
        ids: { nextId: () => id },
        clock: { nowUtc: () => NOW },
      },
    ),
    revision: parseRevision(2),
  };
}

const issueItem = makeKnowledgeItem("issue", "部署连接超时");
const solutionItem = makeKnowledgeItem("solution", "回滚部署并保留旧版本", SOLUTION_KNOWLEDGE_ID);

function createKnowledgeServices(
  overrides: Partial<KnowledgeRuntimeServices> = {},
): KnowledgeRuntimeServices {
  return {
    list: vi.fn(async (): Promise<Page<KnowledgeItem>> => ({
      items: [issueItem, solutionItem],
      nextCursor: null,
    })) as unknown as KnowledgeRuntimeServices["list"],
    get: vi.fn(async (): Promise<KnowledgeDetail | null> => ({
      item: solutionItem,
      sourceJournalDate: parseLocalDate("2026-10-30"),
      sourceJournalAvailable: true,
    })),
    promote: vi.fn(async (): Promise<Result<KnowledgeItem, AppError>> => ok(solutionItem)),
    ...overrides,
  };
}

function createServices(
  knowledge: KnowledgeRuntimeServices = createKnowledgeServices(),
): AppRuntimeServices {
  return {
    ...createRuntimeSettingsStub(),
    analytics: createAnalyticsServicesStub(),
    backups: createBackupServicesStub(),
    exports: createExportServicesStub(),
    imports: createImportServicesStub(),
    knowledge,
    journal: {
      get: vi.fn(),
      save: vi.fn(async (): Promise<Result<SavedJournalSnapshot, AppError>> => {
        throw new Error("not used");
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
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  };
}

function renderWithServices(
  page: React.ReactNode,
  services = createServices(),
  initialEntry = "/knowledge",
): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppServicesProvider services={services}>{page}</AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("Knowledge Base experience", () => {
  it("lists active knowledge and filters by kind", async () => {
    const knowledge = createKnowledgeServices();
    const user = userEvent.setup();
    renderWithServices(<KnowledgePage />, createServices(knowledge));

    expect(await screen.findByRole("article", { name: "部署连接超时" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "回滚部署并保留旧版本" })).toBeTruthy();
    expect(knowledge.list).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));

    await user.click(screen.getByRole("button", { name: "问题" }));

    await waitFor(() =>
      expect(knowledge.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "active", kind: "issue" }),
      ),
    );
  });

  it("opens a knowledge item with its source journal link", async () => {
    renderWithServices(
      <Routes>
        <Route path="/knowledge/:id" element={<KnowledgeDetailPage />} />
      </Routes>,
      createServices(),
      `/knowledge/${KNOWLEDGE_ID}`,
    );

    expect(await screen.findByRole("heading", { name: "回滚部署并保留旧版本" })).toBeTruthy();
    expect(screen.getByText("回滚后服务恢复，记录检查清单。")).toBeTruthy();
    expect(screen.getByRole("link", { name: /原始日志/u })).toHaveAttribute(
      "href",
      `/journal/2026-10-30#block-${BLOCK_ID}`,
    );
    expect(screen.getByText(new RegExp(BLOCK_ID, "u"))).toBeTruthy();
  });

  it("marks a deleted or inaccessible source journal as unavailable", async () => {
    const knowledge = createKnowledgeServices({
      get: vi.fn(async (): Promise<KnowledgeDetail | null> => ({
        item: solutionItem,
        sourceJournalDate: null,
        sourceJournalAvailable: false,
      })),
    });

    renderWithServices(
      <Routes>
        <Route path="/knowledge/:id" element={<KnowledgeDetailPage />} />
      </Routes>,
      createServices(knowledge),
      `/knowledge/${KNOWLEDGE_ID}`,
    );

    expect(await screen.findByText("来源不可用")).toBeTruthy();
    expect(
      screen.getByText("来源日志已删除或当前无法访问，知识正文仍可正常使用。"),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /原始日志/u })).not.toBeInTheDocument();
  });

  it("explains the available ways to create knowledge when the library is empty", async () => {
    const knowledge = createKnowledgeServices({
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
    });
    renderWithServices(<KnowledgePage />, createServices(knowledge));

    expect(await screen.findByText("这里还没有知识条目")).toBeTruthy();
    expect(screen.getByText(/从每日日志沉淀整篇内容/u)).toBeTruthy();
    expect(screen.getByText(/选中结构化块后只沉淀该块/u)).toBeTruthy();
  });

  it("shows a recoverable error without querying when the knowledge id is invalid", async () => {
    const knowledge = createKnowledgeServices();

    renderWithServices(
      <Routes>
        <Route path="/knowledge/:id" element={<KnowledgeDetailPage />} />
      </Routes>,
      createServices(knowledge),
      "/knowledge/not-a-valid-id",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("知识条目编号无效");
    expect(knowledge.get).not.toHaveBeenCalled();
  });

  it("promotes a selected journal block and preserves its source identifiers", async () => {
    const knowledge = createKnowledgeServices();
    const user = userEvent.setup();
    const lookup: JournalLookup = {
      journal: { ...journal, revision: parseRevision(3) },
      isPersisted: true,
    };

    renderWithServices(
      <KnowledgePromotionDialog
        open
        journal={lookup.journal}
        sourceBlockId={BLOCK_ID}
        onOpenChange={() => undefined}
      />,
      createServices(knowledge),
    );

    await user.click(screen.getByRole("button", { name: "问题" }));
    await user.clear(screen.getByLabelText("知识标题"));
    await user.type(screen.getByLabelText("知识标题"), "连接超时的排查记录");
    await user.click(screen.getByRole("button", { name: "保存到知识库" }));

    await waitFor(() =>
      expect(knowledge.promote).toHaveBeenCalledWith({
        journalId: journal.id,
        sourceBlockId: BLOCK_ID,
        kind: "issue",
        title: "连接超时的排查记录",
      }),
    );
  });

  it("promotes a whole journal without inventing a source block", async () => {
    const knowledge = createKnowledgeServices();
    const user = userEvent.setup();
    const onPromoted = vi.fn();

    renderWithServices(
      <KnowledgePromotionDialog
        open
        journal={journal}
        onOpenChange={() => undefined}
        onPromoted={onPromoted}
      />,
      createServices(knowledge),
    );

    await user.click(screen.getByRole("button", { name: "保存到知识库" }));

    await waitFor(() =>
      expect(knowledge.promote).toHaveBeenCalledWith({
        journalId: journal.id,
        kind: "note",
        title: journal.title,
      }),
    );
    expect(onPromoted).toHaveBeenCalledWith(solutionItem);
  });
});

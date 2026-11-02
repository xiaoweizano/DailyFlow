// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  JournalSummary,
  JournalLookup,
  SavedJournalSnapshot,
  StoredAttachment,
} from "@dailyflow/application";
import {
  createJournal,
  parseEntityId,
  parseRevision,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { ActivityHeatmap } from "../src/dashboard/activity-heatmap.js";
import { DashboardPage } from "../src/dashboard/dashboard-page.js";
import { TodayJournalPanel } from "../src/dashboard/today-journal-panel.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const savedAt = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

function createJournalLookup(
  overrides: { readonly persisted?: boolean; readonly title?: string } = {},
): JournalLookup {
  const journal = createJournal(
    {
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
      title: overrides.title ?? "",
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "今天完成导入设计" }] }],
        },
      },
      contentMarkdown: "今天完成导入设计",
      contentPlainText: "今天完成导入设计",
      excerpt: "今天完成导入设计",
      projectionVersion: 1,
    },
    {
      ids: { nextId: () => journalId },
      clock: { nowUtc: () => savedAt },
    },
  );

  return {
    journal: {
      ...journal,
      revision: parseRevision(overrides.persisted === true ? 3 : 0),
    },
    isPersisted: overrides.persisted ?? false,
  };
}

function createSummary(
  date: string,
  title: string,
  id = "0198e2f4-7e33-7c70-a8b2-18c1520f9c27",
): JournalSummary {
  return {
    id: parseEntityId(id),
    journalDate: date as JournalSummary["journalDate"],
    title,
    excerpt: `${title}摘要`,
    revision: 1,
    updatedAt: savedAt,
  };
}

function createServices(options: {
  readonly lookup?: JournalLookup;
  readonly summaries?: readonly JournalSummary[];
  readonly getError?: AppError;
} = {}) {
  const lookup = options.lookup ?? createJournalLookup();
  const summaries = options.summaries ?? [];

  return {
    journal: {
      get: vi.fn(
        async (): Promise<Result<JournalLookup, AppError>> =>
          options.getError === undefined ? ok(lookup) : err(options.getError),
      ),
      save: vi.fn(async (): Promise<Result<SavedJournalSnapshot, AppError>> => {
        throw new Error("not used");
      }),
      list: vi.fn(async () => ({ items: summaries, nextCursor: null })),
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
  } satisfies AppRuntimeServices;
}

function renderDashboard(services: AppRuntimeServices): void {
  render(
    <MemoryRouter>
      <AppServicesProvider services={services}>
        <DashboardPage today="2026-10-30" />
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  it("renders actionable empty states without inventing activity", async () => {
    const services = createServices();
    renderDashboard(services);

    expect(await screen.findByText("今天还没有记录")).toBeTruthy();
    expect(screen.getByRole("link", { name: "创建第一篇日志" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "导入历史 TXT" })).toBeTruthy();
    expect(screen.getByText("没有待办事项")).toBeTruthy();
    expect(screen.getByText("暂无最近知识")).toBeTruthy();
    expect(screen.getByText("过去 12 周还没有记录")).toBeTruthy();
  });

  it("shows today's journal and links recent activity to journal dates", async () => {
    const services = createServices({
      lookup: createJournalLookup({ persisted: true, title: "发布复盘" }),
      summaries: [
        createSummary("2026-10-29", "导入设计"),
        createSummary("2026-10-28", "搜索方案"),
      ],
    });
    renderDashboard(services);

    expect(await screen.findByRole("heading", { name: "发布复盘" })).toBeTruthy();
    expect(screen.getByText("今天完成导入设计")).toBeTruthy();
    expect(screen.getByRole("link", { name: /导入设计/u })).toHaveAttribute(
      "href",
      "/journal/2026-10-29",
    );
    expect(screen.getByRole("link", { name: /搜索方案/u })).toHaveAttribute(
      "href",
      "/journal/2026-10-28",
    );
    expect(screen.getByRole("status", { name: "2026-10-30 有 1 篇日志" })).toBeTruthy();
  });

  it("shows a recoverable error and retries loading", async () => {
    const services = createServices({
      getError: { code: "STORAGE_UNAVAILABLE", retryable: true },
    });
    const user = userEvent.setup();
    renderDashboard(services);

    expect(await screen.findByRole("alert")).toHaveTextContent("工作台加载失败");
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(services.journal.get).toHaveBeenCalledTimes(2);
    expect(services.journal.list).toHaveBeenCalledTimes(2);
  });
});

describe("TodayJournalPanel", () => {
  it("keeps save progress and failure visible with recovery actions", () => {
    const lookup = createJournalLookup({ persisted: true, title: "发布复盘" });
    const { rerender } = render(
      <MemoryRouter>
        <TodayJournalPanel lookup={lookup} status="saving" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在保存");

    rerender(
      <MemoryRouter>
        <TodayJournalPanel lookup={lookup} status="error" onRetry={() => undefined} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("保存失败");
    expect(screen.getByRole("link", { name: "继续记录今天" })).toHaveAttribute(
      "href",
      "/journal/2026-10-30",
    );
  });
});

describe("ActivityHeatmap", () => {
  it("labels every day with its date and journal count", () => {
    render(
      <ActivityHeatmap
        endDate="2026-10-30"
        summaries={[createSummary("2026-10-30", "发布复盘")]}
      />,
    );

    expect(screen.getByLabelText("2026-10-30 有 1 篇日志")).toBeTruthy();
    expect(screen.getByLabelText("2026-10-29 有 0 篇日志")).toBeTruthy();
  });
});

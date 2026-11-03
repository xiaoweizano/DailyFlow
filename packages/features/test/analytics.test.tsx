// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  AnalyticsPeriod,
  AnalyticsSummary,
} from "@dailyflow/application";
import {
  createContentDocument,
  createReport as createDomainReport,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type Report,
} from "@dailyflow/domain";
import { ok } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AnalyticsPage } from "../src/analytics/analytics-page.js";
import type { AnalyticsRuntimeServices } from "../src/analytics/analytics-services.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { createImportServicesStub } from "./import-stub.js";

const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");
const REPORT_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c81");

const summary: AnalyticsSummary = {
  period: {
    periodType: "week",
    start: parseLocalDate("2026-10-26"),
    end: parseLocalDate("2026-11-01"),
    timezone: "Asia/Shanghai",
  },
  journalDays: 3,
  journalCount: 4,
  characterCount: 1280,
  tasksCompleted: 5,
  issuesCreated: 2,
  solutionsCreated: 1,
  knowledgeItems: 3,
  activeTags: [
    { name: "导入", count: 2 },
    { name: "SQLite", count: 1 },
  ],
  dailyActivity: [
    {
      date: parseLocalDate("2026-10-26"),
      journalCount: 1,
      characterCount: 320,
      tasksCompleted: 2,
    },
    {
      date: parseLocalDate("2026-10-27"),
      journalCount: 0,
      characterCount: 0,
      tasksCompleted: 1,
    },
    {
      date: parseLocalDate("2026-10-28"),
      journalCount: 2,
      characterCount: 640,
      tasksCompleted: 1,
    },
    {
      date: parseLocalDate("2026-10-29"),
      journalCount: 0,
      characterCount: 0,
      tasksCompleted: 0,
    },
    {
      date: parseLocalDate("2026-10-30"),
      journalCount: 1,
      characterCount: 320,
      tasksCompleted: 1,
    },
    {
      date: parseLocalDate("2026-10-31"),
      journalCount: 0,
      characterCount: 0,
      tasksCompleted: 0,
    },
    {
      date: parseLocalDate("2026-11-01"),
      journalCount: 0,
      characterCount: 0,
      tasksCompleted: 0,
    },
  ],
  missingDataNotes: [],
};

function createStoredReport(period: AnalyticsPeriod): Report {
  const created = createDomainReport(
    {
      periodType: period.periodType,
      periodStart: period.start,
      periodEnd: period.end,
      timezone: period.timezone,
      title: period.periodType === "week" ? "2026 年第 44 周" : "工作周期复盘",
      content: createContentDocument(1, {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "本周完成了导入链路设计。" }],
          },
        ],
      }),
      projectionVersion: 1,
      stats: {
        journalCount: summary.journalCount,
      },
    },
    {
      ids: { nextId: () => REPORT_ID },
      clock: { nowUtc: () => NOW },
    },
  );

  return { ...created, revision: parseRevision(2) };
}

function createAnalyticsServices(
  options: {
    readonly report?: Report | null;
    readonly summary?: AnalyticsSummary;
  } = {},
): AnalyticsRuntimeServices {
  const report = options.report ?? null;
  return {
    getSummary: vi.fn(async () => options.summary ?? summary),
    getReport: vi.fn(async (_period: AnalyticsPeriod) => report),
    saveReport: vi.fn(async (input) =>
      ok({
        ...createStoredReport(summary.period),
        title: input.title,
        content: input.content,
        revision: parseRevision(report?.revision ?? 1),
      }),
    ),
    generateDraft: vi.fn(() => ({
      title: "2026-10-26 至 2026-11-01 周报",
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "统计周期：2026-10-26 至 2026-11-01" }],
            },
          ],
        },
      },
      stats: {
        journalCount: summary.journalCount,
      },
    })),
  };
}

function createServices(
  analytics: AnalyticsRuntimeServices = createAnalyticsServices(),
): AppRuntimeServices {
  return {
    analytics,
    imports: createImportServicesStub(),
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(),
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
      add: vi.fn(),
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

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return (
    <output aria-label="当前地址">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage(
  path = "/analytics/week/2026-10-28",
  analytics = createAnalyticsServices(),
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppServicesProvider services={createServices(analytics)}>
        <Routes>
          <Route
            path="/analytics/:periodType/:start"
            element={<AnalyticsPage today="2026-10-30" timezone="Asia/Shanghai" />}
          />
        </Routes>
        <LocationProbe />
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("Analytics experience", () => {
  it("renders period statistics, accessible trend values, tag distribution, and report entry", async () => {
    const analytics = createAnalyticsServices();
    renderPage("/analytics/week/2026-10-28", analytics);

    expect(await screen.findByRole("heading", { name: "分析" })).toBeTruthy();
    expect(screen.getByText("2026-10-26 至 2026-11-01")).toBeTruthy();
    expect(screen.getByText("记录天数")).toBeTruthy();
    expect(screen.getByText("1,280")).toBeTruthy();
    expect(screen.getByLabelText("2026-10-28：2 篇日志，1 个任务完成")).toBeTruthy();
    expect(screen.getByText("导入")).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开周期报告" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 辅助写作：未配置" })).toBeDisabled();
    expect(analytics.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        periodType: "week",
        start: "2026-10-26",
        end: "2026-11-01",
        timezone: "Asia/Shanghai",
      }),
    );
  });

  it("keeps selected period and report state in the URL when navigating", async () => {
    const user = userEvent.setup();
    renderPage("/analytics/week/2026-10-28?report=1");

    await screen.findByRole("heading", { name: "分析" });
    await user.click(screen.getByRole("button", { name: "月" }));

    await waitFor(() =>
      expect(screen.getByLabelText("当前地址")).toHaveTextContent(
        "/analytics/month/2026-10-01?report=1",
      ),
    );

    await user.click(screen.getByRole("button", { name: "上一周期" }));
    await waitFor(() =>
      expect(screen.getByLabelText("当前地址")).toHaveTextContent(
        "/analytics/month/2026-09-01?report=1",
      ),
    );
  });

  it("opens, edits, and saves a canonical report draft", async () => {
    const user = userEvent.setup();
    const analytics = createAnalyticsServices();
    renderPage("/analytics/week/2026-10-28?report=1", analytics);

    expect(await screen.findByRole("heading", { name: "周期报告" })).toBeTruthy();
    const title = await screen.findByLabelText("报告标题");
    expect(title).toHaveValue("2026-10-26 至 2026-11-01 周报");

    await user.clear(title);
    await user.type(title, "第 44 周工作复盘");
    await user.click(screen.getByRole("button", { name: "保存报告" }));

    await waitFor(() => expect(analytics.saveReport).toHaveBeenCalledTimes(1));
    expect(analytics.saveReport).toHaveBeenCalledWith(
      expect.objectContaining({
        periodType: "week",
        periodStart: "2026-10-26",
        periodEnd: "2026-11-01",
        timezone: "Asia/Shanghai",
        title: "第 44 周工作复盘",
        expectedRevision: null,
        content: expect.objectContaining({
          schemaVersion: 1,
          doc: expect.objectContaining({ type: "doc" }),
        }),
      }),
    );
    expect(await screen.findByText("报告已保存")).toBeTruthy();
  });
});

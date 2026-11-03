// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  JournalSummary,
  Page,
  SavedJournalSnapshot,
  StoredAttachment,
  TimelineDaySummary,
  TimelineQuery,
  TaskListView,
} from "@dailyflow/application";
import {
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type Task,
} from "@dailyflow/domain";
import { ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import type { TaskRuntimeServices } from "../src/tasks/task-services.js";
import { isLocalDate, shiftLocalDate } from "../src/date-utils.js";
import { ActivityHeatmap } from "../src/timeline/activity-heatmap.js";
import { MonthCalendar } from "../src/timeline/month-calendar.js";
import { TimelinePage } from "../src/timeline/timeline-page.js";
import { TasksPage } from "../src/tasks/tasks-page.js";

const TASK_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29");
const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const summary: JournalSummary = {
  id: JOURNAL_ID,
  journalDate: parseLocalDate("2026-10-30"),
  title: "发布复盘",
  excerpt: "修复了离线导入问题",
  revision: 3,
  updatedAt: NOW,
};

const day: TimelineDaySummary = {
  date: parseLocalDate("2026-10-30"),
  journalId: JOURNAL_ID,
  journalCount: 1,
  taskDueCount: 2,
  title: "发布复盘",
  excerpt: "修复了离线导入问题",
  updatedAt: NOW,
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    title: "补齐离线导入测试",
    description: null,
    descriptionText: "确认 GBK 和 UTF-8 BOM 都能导入。",
    status: "open",
    priority: "high",
    dueDate: parseLocalDate("2026-10-30"),
    completedAt: null,
    journalId: JOURNAL_ID,
    knowledgeItemId: null,
    revision: parseRevision(1),
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function createTaskServices(initialTasks: readonly Task[] = [makeTask()]): TaskRuntimeServices {
  const tasks = [...initialTasks];
  const list = vi.fn(async (_view: TaskListView): Promise<Page<Task>> => ({
    items: _view === "completed" ? tasks.filter((item) => item.status === "done") : tasks,
    nextCursor: null,
  }));

  return {
    list,
    complete: vi.fn(async (item: Task): Promise<Result<Task, AppError>> => {
      const completed = {
        ...item,
        status: "done" as const,
        completedAt: NOW,
        revision: parseRevision(item.revision + 1),
      };
      tasks.splice(tasks.indexOf(item), 1, completed);
      return ok(completed);
    }),
    reopen: vi.fn(async (item: Task): Promise<Result<Task, AppError>> =>
      ok({ ...item, status: "open", completedAt: null }),
    ),
    update: vi.fn(async (item: Task, changes: Partial<Task>): Promise<Result<Task, AppError>> =>
      ok({ ...item, ...changes }),
    ),
  };
}

function createServices(
  options: {
    readonly timeline?: Partial<TimelineQuery>;
    readonly taskServices?: TaskRuntimeServices;
  } = {},
): AppRuntimeServices {
  const timeline: TimelineQuery = {
    getCalendar: vi.fn(async () => [day]),
    listEntries: vi.fn(async () => ({ items: [day], nextCursor: null })),
    ...options.timeline,
  };

  return {
    analytics: createAnalyticsServicesStub(),
    exports: createExportServicesStub(),
    imports: createImportServicesStub(),
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(async (): Promise<Result<SavedJournalSnapshot, AppError>> => {
        throw new Error("not used");
      }),
      list: vi.fn(async () => ({ items: [summary], nextCursor: null })),
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
    timeline,
    tasks: options.taskServices ?? createTaskServices(),
  };
}

function renderPage(page: React.ReactNode, services = createServices()): void {
  render(
    <MemoryRouter>
      <AppServicesProvider services={services}>{page}</AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("local date boundaries", () => {
  it("handles leap day, month end, year crossing, and strict local dates", () => {
    expect(isLocalDate("2024-02-29")).toBe(true);
    expect(isLocalDate("2023-02-29")).toBe(false);
    expect(isLocalDate("2024-2-29")).toBe(false);
    expect(shiftLocalDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftLocalDate("2024-02-29", 1)).toBe("2024-03-01");
    expect(shiftLocalDate("2024-12-31", 1)).toBe("2025-01-01");
    expect(shiftLocalDate("2025-01-01", -1)).toBe("2024-12-31");
  });
});

describe("Timeline experience", () => {
  it("renders accessible month date cells that support keyboard selection", async () => {
    const onSelectDate = vi.fn();
    const user = userEvent.setup();
    render(
      <MonthCalendar
        month="2024-02"
        selectedDate="2024-02-29"
        days={[
          {
            ...day,
            date: parseLocalDate("2024-02-29"),
            journalDate: undefined,
          } as TimelineDaySummary,
        ]}
        onSelectDate={onSelectDate}
      />,
    );

    const leapDay = screen.getByRole("button", { name: /2024-02-29/u });
    leapDay.focus();
    await user.keyboard("{Enter}");

    expect(onSelectDate).toHaveBeenCalledWith("2024-02-29");
  });

  it("switches between calendar, chronological timeline, and heatmap views", async () => {
    const user = userEvent.setup();
    renderPage(<TimelinePage today="2026-10-30" />);

    expect(await screen.findByRole("heading", { name: "2026 年 10 月" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "时间线" }));
    expect(await screen.findByRole("link", { name: /发布复盘/u })).toHaveAttribute(
      "href",
      "/journal/2026-10-30",
    );

    await user.click(screen.getByRole("button", { name: "热力图" }));
    expect(screen.getByText("按日志数量着色")).toBeTruthy();
    expect(screen.getByLabelText("2026-10-30，1 篇日志，2 个任务到期")).toBeTruthy();
  });

  it("shows the heatmap definition and per-day values", () => {
    render(<ActivityHeatmap endDate="2026-10-30" days={[day]} weeks={12} />);

    expect(screen.getByText("按日志数量着色")).toBeTruthy();
    expect(screen.getByText(/每格代表一天/u)).toBeTruthy();
    expect(screen.getByLabelText("2026-10-30，1 篇日志，2 个任务到期")).toBeTruthy();
  });
});

describe("Tasks experience", () => {
  it.each<readonly [string, TaskListView]>([
    ["今天", "today"],
    ["即将到期", "upcoming"],
    ["全部", "all"],
    ["已完成", "completed"],
  ])("loads the %s task view", async (label, view) => {
    const taskServices = createTaskServices();
    renderPage(<TasksPage today="2026-10-30" />, createServices({ taskServices }));

    await userEvent.click(screen.getByRole("button", { name: label }));

    await waitFor(() =>
      expect(taskServices.list).toHaveBeenLastCalledWith(view, expect.anything()),
    );
  });

  it("completes a task inline and opens an editable association drawer", async () => {
    const taskServices = createTaskServices();
    const user = userEvent.setup();
    renderPage(<TasksPage today="2026-10-30" />, createServices({ taskServices }));

    const row = await screen.findByRole("article", { name: /补齐离线导入测试/u });
    await user.click(within(row).getByRole("button", { name: "完成待办" }));
    expect(taskServices.complete).toHaveBeenCalledTimes(1);

    await user.click(within(row).getByRole("button", { name: "打开待办详情" }));
    const drawer = screen.getByRole("dialog", { name: "待办详情" });
    expect(within(drawer).getByLabelText("关联日志日期")).toHaveValue("2026-10-30");
    expect(within(drawer).getByText("关联日志")).toBeTruthy();
  });
});

// @vitest-environment jsdom

import "./setup-dom.js";

import { createTask, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { err, ok } from "@dailyflow/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { TasksPage } from "../src/tasks/tasks-page.js";

function createTasksServices(): AppRuntimeServices {
  const task = createTask(
    {
      title: "发布候选版本",
      dueDate: "2026-11-05",
    },
    {
      ids: { nextId: () => parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29") },
      clock: { nowUtc: () => parseUtcTimestamp("2026-11-05T03:20:11.123Z") },
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
      read: vi.fn(),
    },
    tasks: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      create: vi.fn(async () => ok(task)),
      complete: vi.fn(),
      reopen: vi.fn(),
      update: vi.fn(),
    },
    timeline: {
      getCalendar: vi.fn(async () => []),
      getAnnualActivity: vi.fn(async () => []),
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  } satisfies AppRuntimeServices;
}

describe("TasksPage", () => {
  it("creates a task with a date-picker due date", async () => {
    const services = createTasksServices();
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={services}>
        <TasksPage today="2026-11-05" />
      </AppServicesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "新建待办" }));
    await user.type(screen.getByRole("textbox", { name: "任务标题" }), "发布候选版本");
    const dueDate = screen.getByLabelText("待办截止日期");
    expect(dueDate).toHaveAttribute("type", "date");
    fireEvent.change(dueDate, { target: { value: "2026-11-05" } });
    await user.click(screen.getByRole("button", { name: "创建待办" }));

    expect(services.tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "发布候选版本",
        dueDate: "2026-11-05",
      }),
    );
  });

  it("shows a field error when the task title is empty", async () => {
    const services = createTasksServices();
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={services}>
        <TasksPage today="2026-11-05" />
      </AppServicesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "新建待办" }));
    await user.click(screen.getByRole("button", { name: "创建待办" }));

    expect(screen.getByText("请输入待办标题")).toBeVisible();
    expect(services.tasks.create).not.toHaveBeenCalled();
  });

  it("shows a field error when the task due date is invalid", async () => {
    const services = createTasksServices();
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={services}>
        <TasksPage today="2026-11-05" />
      </AppServicesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "新建待办" }));
    await user.type(screen.getByRole("textbox", { name: "任务标题" }), "发布候选版本");
    const dueDate = screen.getByLabelText("待办截止日期");
    dueDate.setAttribute("type", "text");
    fireEvent.change(dueDate, {
      target: { value: "2026-02-30" },
    });
    await user.click(screen.getByRole("button", { name: "创建待办" }));

    expect(screen.getByText("请选择有效日期")).toBeVisible();
    expect(services.tasks.create).not.toHaveBeenCalled();
  });

  it("maps backend validation errors to the matching task field", async () => {
    const services = createTasksServices();
    services.tasks.create = vi.fn(async () =>
      err({
        code: "VALIDATION_ERROR",
        message: "Task creation failed.",
        fields: { title: "标题已被后端拒绝" },
      } as const),
    );
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={services}>
        <TasksPage today="2026-11-05" />
      </AppServicesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "新建待办" }));
    const title = screen.getByRole("textbox", { name: "任务标题" });
    await user.type(title, "发布候选版本");
    await user.click(screen.getByRole("button", { name: "创建待办" }));

    expect(screen.getByText("标题已被后端拒绝")).toBeVisible();
    expect(title).toHaveValue("发布候选版本");
  });

  it("keeps backend due-date validation beside the date field", async () => {
    const services = createTasksServices();
    services.tasks.create = vi.fn(async () =>
      err({
        code: "VALIDATION_ERROR",
        message: "Task creation failed.",
        fields: { dueDate: "交付日期不可用" },
      } as const),
    );
    const user = userEvent.setup();
    render(
      <AppServicesProvider services={services}>
        <TasksPage today="2026-11-05" />
      </AppServicesProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "新建待办" }));
    await user.type(screen.getByRole("textbox", { name: "任务标题" }), "发布候选版本");
    const dueDate = screen.getByLabelText("待办截止日期");
    fireEvent.change(dueDate, { target: { value: "2026-11-08" } });
    await user.click(screen.getByRole("button", { name: "创建待办" }));

    expect(screen.getByText("交付日期不可用")).toBeVisible();
    expect(dueDate).toHaveValue("2026-11-08");
  });

  it("shows visible complete and reopen actions while keeping task editing available", async () => {
    const services = createTasksServices();
    const dependencies = {
      ids: { nextId: () => parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2a") },
      clock: { nowUtc: () => parseUtcTimestamp("2026-11-05T03:20:11.123Z") },
    };
    const openTask = createTask({ title: "准备发布说明" }, dependencies);
    const doneTask = createTask(
      {
        title: "归档发布包",
        status: "done",
        completedAt: "2026-11-05T04:20:11.123Z",
      },
      {
        ...dependencies,
        ids: { nextId: () => parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2b") },
      },
    );
    services.tasks.list = vi.fn(async () => ({
      items: [openTask, doneTask],
      nextCursor: null,
    }));

    render(
      <AppServicesProvider services={services}>
        <TasksPage today="2026-11-05" />
      </AppServicesProvider>,
    );

    const openRow = await screen.findByRole("article", { name: "待办：准备发布说明" });
    const doneRow = screen.getByRole("article", { name: "待办：归档发布包" });

    expect(within(openRow).getByRole("button", { name: "完成待办" })).toBeVisible();
    expect(within(openRow).getByRole("button", { name: "打开待办详情" })).toBeVisible();
    expect(within(doneRow).getByRole("button", { name: "重新打开待办" })).toBeVisible();
    expect(within(doneRow).getByRole("button", { name: "打开待办详情" })).toBeVisible();
  });
});

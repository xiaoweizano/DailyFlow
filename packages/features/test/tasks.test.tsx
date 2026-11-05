// @vitest-environment jsdom

import "./setup-dom.js";

import { createTask, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { ok } from "@dailyflow/shared";
import { fireEvent, render, screen } from "@testing-library/react";
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
});

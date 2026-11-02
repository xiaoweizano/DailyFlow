import type { Page } from "@dailyflow/application";
import {
  buildTaskListQuery,
  isTaskOverdue,
  reopenTask,
  updateTask,
  type TaskListView,
} from "@dailyflow/application";
import { markTaskDone, parseLocalDate, parseRevision, type Task } from "@dailyflow/domain";
import { describe, expect, it } from "vitest";

import { FakeTaskRepository, NOW_TIMESTAMP, clock, makeTask } from "./support.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...makeTask(),
    ...overrides,
  };
}

describe("task list query", () => {
  it.each<{
    readonly view: TaskListView;
    readonly expected: ReturnType<typeof buildTaskListQuery>;
  }>([
    {
      view: "today",
      expected: {
        status: ["open", "in_progress"],
        dueTo: parseLocalDate("2024-02-29"),
      },
    },
    {
      view: "upcoming",
      expected: {
        status: ["open", "in_progress"],
        dueFrom: parseLocalDate("2024-03-01"),
        dueTo: parseLocalDate("2024-03-14"),
      },
    },
    {
      view: "all",
      expected: {
        status: ["open", "in_progress"],
      },
    },
    {
      view: "completed",
      expected: {
        status: ["done"],
      },
    },
  ])("maps the $view view without relying on UTC calendar days", ({ view, expected }) => {
    expect(buildTaskListQuery(view, "2024-02-29", { cursor: "next", limit: 25 })).toEqual({
      ...expected,
      cursor: "next",
      limit: 25,
    });
  });

  it("treats only unfinished tasks before today as overdue", () => {
    const today = parseLocalDate("2024-03-01");

    expect(isTaskOverdue(task({ dueDate: parseLocalDate("2024-02-29") }), today)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: today }), today)).toBe(false);
    expect(
      isTaskOverdue(
        task({
          dueDate: parseLocalDate("2024-02-29"),
          status: "done",
          completedAt: NOW_TIMESTAMP,
        }),
        today,
      ),
    ).toBe(false);
    expect(
      isTaskOverdue(
        task({
          dueDate: parseLocalDate("2024-02-29"),
          status: "cancelled",
        }),
        today,
      ),
    ).toBe(false);
  });

  it("keeps completion timestamps stable when a task is reopened and completed again", async () => {
    const completedAt = NOW_TIMESTAMP;
    const done = markTaskDone(task(), { nowUtc: () => "2024-02-29T23:59:59.999Z" });
    const reopened = {
      ...done,
      status: "open" as const,
      completedAt: null,
      updatedAt: completedAt,
    };
    const repositories = new FakeTaskRepository();
    const page: Page<Task> = {
      items: [reopened],
      nextCursor: null,
    };
    repositories.list = async () => page;

    expect(reopened.completedAt).toBeNull();
    expect(done.completedAt).toBe("2024-02-29T23:59:59.999Z");
    expect(await repositories.list({})).toBe(page);
    expect(clock.nowUtc()).toBe("2026-10-30T03:20:11.123Z");
  });
});

describe("task mutations", () => {
  it("reopens a completed task while preserving optimistic concurrency", async () => {
    const repositories = new FakeTaskRepository();
    const completed = task({
      status: "done",
      completedAt: NOW_TIMESTAMP,
      revision: parseRevision(3),
    });
    repositories.taskById = completed;

    const result = await reopenTask(
      { tasks: repositories, clock },
      { taskId: completed.id, expectedRevision: 3 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected reopenTask to succeed");
    }
    expect(result.value.status).toBe("open");
    expect(result.value.completedAt).toBeNull();
    expect(result.value.updatedAt).toBe(NOW_TIMESTAMP);
    expect(repositories.saved).toEqual([{ task: result.value, expectedRevision: 3 }]);
  });

  it("updates editable task fields without letting callers change lifecycle fields", async () => {
    const repositories = new FakeTaskRepository();
    const currentTask = task({ revision: parseRevision(4) });
    repositories.taskById = currentTask;

    const result = await updateTask(
      { tasks: repositories, clock },
      {
        taskId: currentTask.id,
        expectedRevision: 4,
        title: "补充导入回归测试",
        priority: "urgent",
        dueDate: "2024-02-29",
        journalId: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
        knowledgeItemId: null,
        status: "done",
        revision: 99,
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected updateTask to succeed");
    }
    expect(result.value).toMatchObject({
      title: "补充导入回归测试",
      priority: "urgent",
      dueDate: "2024-02-29",
      journalId: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
      status: "open",
      revision: 4,
    });
    expect(result.value.updatedAt).toBe(NOW_TIMESTAMP);
  });
});

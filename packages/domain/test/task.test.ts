import { describe, expect, it } from "vitest";

import {
  createTask,
  markTaskDone,
  reopenTask,
  type Clock,
  type IdGenerator,
} from "../src/index.js";

const ids: IdGenerator = {
  nextId: () => "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
};

let now = "2026-10-30T03:20:11.123Z";
const clock: Clock = {
  nowUtc: () => now,
};

describe("Task", () => {
  it("rejects a task title that only contains whitespace", () => {
    expect(() => createTask({ title: "  \t " }, { ids, clock })).toThrow("title");
  });

  it("requires done tasks to have a completion timestamp", () => {
    expect(() =>
      createTask(
        {
          title: "发布桌面版",
          status: "done",
        },
        { ids, clock },
      ),
    ).toThrow("completedAt");
  });

  it("requires non-done tasks to clear the completion timestamp", () => {
    expect(() =>
      createTask(
        {
          title: "发布桌面版",
          status: "open",
          completedAt: "2026-10-30T03:20:11.123Z",
        },
        { ids, clock },
      ),
    ).toThrow("completedAt");
  });

  it("does not silently convert an empty due date into no date", () => {
    expect(() => createTask({ title: "发布桌面版", dueDate: "" }, { ids, clock })).toThrow(
      "Invalid LocalDate",
    );
  });

  it("does not silently convert an empty relation ID into no relation", () => {
    expect(() => createTask({ title: "发布桌面版", journalId: "" }, { ids, clock })).toThrow(
      "UUIDv7",
    );
  });

  it("does not silently discard an empty completion timestamp", () => {
    expect(() =>
      createTask(
        {
          title: "发布桌面版",
          status: "open",
          completedAt: "",
        },
        { ids, clock },
      ),
    ).toThrow(RangeError);
  });

  it("sets and clears completedAt with state transitions", () => {
    const task = createTask(
      {
        title: "发布桌面版",
        dueDate: "2026-11-01",
      },
      { ids, clock },
    );

    const completed = markTaskDone(task, clock);
    expect(completed.status).toBe("done");
    expect(completed.completedAt).toBe("2026-10-30T03:20:11.123Z");

    now = "2026-10-31T01:00:00.000Z";
    const reopened = reopenTask(completed, clock);
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeNull();
  });
});

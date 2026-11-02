import { parseLocalDate, type LocalDate, type Task } from "@dailyflow/domain";

import type { PageRequest } from "../ports/pagination.js";
import type { TaskListQuery } from "../ports/task-repository.js";

export type TaskListView = "today" | "upcoming" | "all" | "completed";

const OPEN_TASK_STATUSES = ["open", "in_progress"] as const;

function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return parseLocalDate(shifted.toISOString().slice(0, 10));
}

export function buildTaskListQuery(
  view: TaskListView,
  today: LocalDate | string,
  pageRequest: PageRequest = {},
): TaskListQuery {
  const localToday = typeof today === "string" ? parseLocalDate(today) : today;

  switch (view) {
    case "today":
      return {
        status: OPEN_TASK_STATUSES,
        dueTo: localToday,
        ...pageRequest,
      };
    case "upcoming":
      return {
        status: OPEN_TASK_STATUSES,
        dueFrom: shiftLocalDate(localToday, 1),
        dueTo: shiftLocalDate(localToday, 14),
        ...pageRequest,
      };
    case "all":
      return {
        status: OPEN_TASK_STATUSES,
        ...pageRequest,
      };
    case "completed":
      return {
        status: ["done"],
        ...pageRequest,
      };
  }
}

export function isTaskOverdue(task: Task, today: LocalDate): boolean {
  return (
    task.dueDate !== null &&
    task.dueDate < today &&
    (task.status === "open" || task.status === "in_progress")
  );
}

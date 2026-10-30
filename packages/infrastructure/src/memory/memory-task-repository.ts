import type { Page, TaskListQuery, TaskRepository } from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import {
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type EntityId,
  type Task,
  type UtcTimestamp,
} from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "./pagination-cursor.js";

interface TaskCursor {
  readonly updatedAt: string;
  readonly id: string;
}

function compareTasks(left: Task, right: Task): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function isAfterCursor(task: Task, cursor: TaskCursor): boolean {
  if (task.updatedAt !== cursor.updatedAt) {
    return task.updatedAt < cursor.updatedAt;
  }

  return task.id < cursor.id;
}

function conflict(expectedRevision: number, actualRevision: number, id: EntityId): never {
  throw new PortError("CONFLICT", {
    message: "Task revision conflict",
    entity: "task",
    id,
    expectedRevision,
    actualRevision,
  });
}

function notFound(id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: "Task not found",
    entity: "task",
    id,
  });
}

export class MemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<EntityId, Task>();

  constructor(private readonly dependencies: { readonly clock: Clock }) {}

  async list(query: TaskListQuery): Promise<Page<Task>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<TaskCursor>(query.cursor);
    const statuses = query.status === undefined ? null : new Set(query.status);
    const records = [...this.tasks.values()]
      .filter((task) => task.deletedAt === null)
      .filter((task) => statuses === null || statuses.has(task.status))
      .filter(
        (task) =>
          query.dueFrom === undefined || (task.dueDate !== null && task.dueDate >= query.dueFrom),
      )
      .filter(
        (task) =>
          query.dueTo === undefined || (task.dueDate !== null && task.dueDate <= query.dueTo),
      )
      .filter((task) => cursor === null || isAfterCursor(task, cursor))
      .sort(compareTasks);

    const page = records.slice(0, limit + 1);
    const items = page.slice(0, limit);
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        page.length > limit && last !== undefined
          ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async save(task: Task, expectedRevision: number | null): Promise<Task> {
    const current = this.tasks.get(task.id);
    this.assertExpectedRevision(task.id, current, expectedRevision);

    const saved: Task = {
      ...task,
      revision: parseRevision((current?.revision ?? 0) + 1),
      createdAt: current?.createdAt ?? task.createdAt,
      deletedAt: null,
    };
    this.tasks.set(task.id, saved);

    return saved;
  }

  async complete(id: EntityId, completedAt: UtcTimestamp, expectedRevision: number): Promise<Task> {
    const current = this.tasks.get(id);
    if (current === undefined || current.deletedAt !== null) {
      return notFound(id);
    }
    if (current.revision !== expectedRevision) {
      return conflict(expectedRevision, current.revision, id);
    }

    const completed: Task = {
      ...current,
      status: "done",
      completedAt,
      revision: parseRevision(current.revision + 1),
      updatedAt: completedAt,
    };
    this.tasks.set(id, completed);

    return completed;
  }

  async softDelete(id: EntityId, expectedRevision: number): Promise<void> {
    const current = this.tasks.get(id);
    if (current === undefined || current.deletedAt !== null) {
      return notFound(id);
    }
    if (current.revision !== expectedRevision) {
      return conflict(expectedRevision, current.revision, id);
    }

    const deletedAt = parseUtcTimestamp(this.dependencies.clock.nowUtc());
    this.tasks.set(id, {
      ...current,
      revision: parseRevision(current.revision + 1),
      updatedAt: deletedAt,
      deletedAt,
    });
  }

  private assertExpectedRevision(
    id: EntityId,
    current: Task | undefined,
    expectedRevision: number | null,
  ): void {
    if (expectedRevision === null) {
      if (current !== undefined) {
        throw new PortError("CONFLICT", {
          message: "Task already exists",
          entity: "task",
          id,
          actualRevision: current.revision,
        });
      }
      return;
    }
    if (current === undefined || current.deletedAt !== null) {
      return notFound(id);
    }
    if (current.revision !== expectedRevision) {
      return conflict(expectedRevision, current.revision, id);
    }
  }
}

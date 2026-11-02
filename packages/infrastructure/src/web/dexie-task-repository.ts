import type { Page, TaskListQuery, TaskRepository } from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import { stableStringify } from "@dailyflow/shared";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type ContentDocument,
  type EntityId,
  type JsonObject,
  type Task,
  type UtcTimestamp,
} from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "../memory/pagination-cursor.js";
import type { DailyFlowDb } from "./db.js";
import type { TaskRow } from "./schema.js";

interface TaskCursor {
  readonly updatedAt: string;
  readonly id: string;
}

export interface DexieTaskRepositoryOptions {
  readonly database: DailyFlowDb;
  readonly clock: Clock;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function toDescription(row: TaskRow): ContentDocument | null {
  return row.descriptionJson === null
    ? null
    : createContentDocument(1, parseJson<JsonObject>(row.descriptionJson));
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: toDescription(row),
    descriptionText: row.descriptionText,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    journalId: row.journalId,
    knowledgeItemId: row.knowledgeItemId,
    revision: parseRevision(row.revision),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toRow(task: Task): TaskRow {
  return {
    id: task.id,
    title: task.title,
    descriptionJson: task.description === null ? null : stableStringify(task.description.doc),
    descriptionText: task.descriptionText,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    journalId: task.journalId,
    knowledgeItemId: task.knowledgeItemId,
    revision: task.revision,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}

function compareRows(left: TaskRow, right: TaskRow): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function isAfterCursor(row: TaskRow, cursor: TaskCursor): boolean {
  return row.updatedAt === cursor.updatedAt ? row.id < cursor.id : row.updatedAt < cursor.updatedAt;
}

function conflict(id: EntityId, expectedRevision: number | null, actualRevision?: number): never {
  throw new PortError("CONFLICT", {
    message: "Task revision conflict",
    entity: "task",
    id,
    ...(expectedRevision === null ? {} : { expectedRevision }),
    ...(actualRevision === undefined ? {} : { actualRevision }),
  });
}

function notFound(id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: "Task not found",
    entity: "task",
    id,
  });
}

export class DexieTaskRepository implements TaskRepository {
  private readonly database: DailyFlowDb;
  private readonly clock: Clock;

  constructor(options: DexieTaskRepositoryOptions) {
    this.database = options.database;
    this.clock = options.clock;
  }

  async getById(id: EntityId): Promise<Task | null> {
    const row = await this.database.tasks.get(id);
    return row === undefined || row.deletedAt !== null ? null : toTask(row);
  }

  async list(query: TaskListQuery): Promise<Page<Task>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<TaskCursor>(query.cursor);
    const statuses = query.status === undefined ? null : new Set(query.status);
    const records = (await this.database.tasks.toArray())
      .filter((row) => row.deletedAt === null)
      .filter((row) => statuses === null || statuses.has(row.status))
      .filter(
        (row) =>
          query.dueFrom === undefined || (row.dueDate !== null && row.dueDate >= query.dueFrom),
      )
      .filter(
        (row) => query.dueTo === undefined || (row.dueDate !== null && row.dueDate <= query.dueTo),
      )
      .filter((row) => cursor === null || isAfterCursor(row, cursor))
      .sort(compareRows);
    const selected = records.slice(0, limit + 1);
    const items = selected.slice(0, limit);
    const last = items.at(-1);

    return {
      items: items.map(toTask),
      nextCursor:
        selected.length > limit && last !== undefined
          ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async save(task: Task, expectedRevision: number | null): Promise<Task> {
    return this.database.transaction("rw", this.database.tasks, async () => {
      const current = await this.database.tasks.get(task.id);
      if (expectedRevision === null) {
        if (current !== undefined && current.deletedAt === null) {
          return conflict(task.id, expectedRevision, current.revision);
        }
      } else if (current === undefined || current.deletedAt !== null) {
        return notFound(task.id);
      } else if (current.revision !== expectedRevision) {
        return conflict(task.id, expectedRevision, current.revision);
      }

      const saved: Task = {
        ...task,
        revision: parseRevision((current?.revision ?? 0) + 1),
        createdAt: current?.createdAt ?? task.createdAt,
        deletedAt: null,
      };
      await this.database.tasks.put(toRow(saved));
      return saved;
    });
  }

  async complete(id: EntityId, completedAt: UtcTimestamp, expectedRevision: number): Promise<Task> {
    return this.database.transaction("rw", this.database.tasks, async () => {
      const current = await this.database.tasks.get(id);
      if (current === undefined || current.deletedAt !== null) {
        return notFound(id);
      }
      if (current.revision !== expectedRevision) {
        return conflict(id, expectedRevision, current.revision);
      }

      const completed: Task = {
        ...toTask(current),
        status: "done",
        completedAt,
        revision: parseRevision(current.revision + 1),
        updatedAt: completedAt,
      };
      await this.database.tasks.put(toRow(completed));
      return completed;
    });
  }

  async softDelete(id: EntityId, expectedRevision: number): Promise<void> {
    await this.database.transaction("rw", this.database.tasks, async () => {
      const current = await this.database.tasks.get(id);
      if (current === undefined || current.deletedAt !== null) {
        return notFound(id);
      }
      if (current.revision !== expectedRevision) {
        return conflict(id, expectedRevision, current.revision);
      }

      const deletedAt = parseUtcTimestamp(this.clock.nowUtc());
      await this.database.tasks.put({
        ...current,
        revision: current.revision + 1,
        updatedAt: deletedAt,
        deletedAt,
      });
    });
  }
}

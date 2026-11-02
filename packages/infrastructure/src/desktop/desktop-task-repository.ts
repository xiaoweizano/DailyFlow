import type { Page, TaskListQuery, TaskRepository } from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type Task,
} from "@dailyflow/domain";

import type { TauriCommandClient } from "./tauri-client.js";
import type { TaskDto, TaskListQueryDto } from "./tauri-contracts.js";

export interface DesktopTaskRepositoryOptions {
  readonly client: TauriCommandClient;
  readonly clock: Clock;
}

function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description:
      dto.descriptionJson === null ? null : createContentDocument(1, dto.descriptionJson),
    descriptionText: dto.descriptionText,
    status: dto.status,
    priority: dto.priority,
    dueDate: dto.dueDate,
    completedAt: dto.completedAt,
    journalId: dto.journalId,
    knowledgeItemId: dto.knowledgeItemId,
    revision: parseRevision(dto.revision),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toTaskDto(task: Task): TaskDto {
  return {
    id: task.id,
    title: task.title,
    descriptionJson: task.description?.doc ?? null,
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

function toTaskListQueryDto(query: TaskListQuery): TaskListQueryDto {
  return {
    ...(query.status === undefined ? {} : { status: [...query.status] }),
    ...(query.dueFrom === undefined ? {} : { dueFrom: query.dueFrom }),
    ...(query.dueTo === undefined ? {} : { dueTo: query.dueTo }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

export class DesktopTaskRepository implements TaskRepository {
  private readonly client: TauriCommandClient;
  private readonly clock: Clock;

  constructor(options: DesktopTaskRepositoryOptions) {
    this.client = options.client;
    this.clock = options.clock;
  }

  async getById(id: Task["id"]): Promise<Task | null> {
    const dto = await this.client.getTaskById(id);
    return dto === null ? null : toTask(dto);
  }

  async list(query: TaskListQuery): Promise<Page<Task>> {
    const page = await this.client.listTasks(toTaskListQueryDto(query));
    return {
      items: page.items.map(toTask),
      nextCursor: page.nextCursor,
    };
  }

  async save(task: Task, expectedRevision: number | null): Promise<Task> {
    const dto = await this.client.saveTask({
      task: toTaskDto(task),
      expectedRevision,
    });
    return toTask(dto);
  }

  async complete(
    id: Task["id"],
    completedAt: NonNullable<Task["completedAt"]>,
    expectedRevision: number,
  ): Promise<Task> {
    const dto = await this.client.completeTask({
      taskId: id,
      completedAt,
      expectedRevision,
    });
    return toTask(dto);
  }

  async softDelete(id: Task["id"], expectedRevision: number): Promise<void> {
    await this.client.softDeleteTask({
      taskId: id,
      expectedRevision,
      deletedAt: parseUtcTimestamp(this.clock.nowUtc()),
    });
  }
}

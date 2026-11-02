import type { EntityId, LocalDate, Task, TaskStatus, UtcTimestamp } from "@dailyflow/domain";

import type { Page, PageRequest } from "./pagination.js";

export interface TaskListQuery extends PageRequest {
  readonly status?: readonly TaskStatus[];
  readonly dueFrom?: LocalDate;
  readonly dueTo?: LocalDate;
}

export interface TaskRepository {
  getById(id: EntityId): Promise<Task | null>;
  list(query: TaskListQuery): Promise<Page<Task>>;
  save(task: Task, expectedRevision: number | null): Promise<Task>;
  complete(id: EntityId, completedAt: UtcTimestamp, expectedRevision: number): Promise<Task>;
  softDelete(id: EntityId, expectedRevision: number): Promise<void>;
}

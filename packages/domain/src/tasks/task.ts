import type { Clock, DomainDependencies } from "../shared/ports.js";
import { createContentDocument, type ContentDocument } from "../shared/content.js";
import { DomainRuleError } from "../shared/errors.js";
import {
  nextEntityId,
  nowUtc,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type EntityId,
  type LocalDate,
  type Revision,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  readonly id: EntityId;
  readonly title: string;
  readonly description: ContentDocument | null;
  readonly descriptionText: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: LocalDate | null;
  readonly completedAt: UtcTimestamp | null;
  readonly journalId: EntityId | null;
  readonly knowledgeItemId: EntityId | null;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: ContentDocument | null;
  readonly descriptionText?: string;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
  readonly completedAt?: string | null;
  readonly journalId?: string | null;
  readonly knowledgeItemId?: string | null;
}

function validateTaskState(status: TaskStatus, completedAt: UtcTimestamp | null): void {
  if (status === "done" && completedAt === null) {
    throw new DomainRuleError("completedAt", "completedAt is required when task status is done");
  }
  if (status !== "done" && completedAt !== null) {
    throw new DomainRuleError(
      "completedAt",
      "completedAt must be null when task status is not done",
    );
  }
}

export function createTask(input: CreateTaskInput, dependencies: DomainDependencies): Task {
  if (input.title.trim().length === 0) {
    throw new DomainRuleError("title", "Task title cannot be empty");
  }
  if (!TASK_STATUSES.includes(input.status ?? "open")) {
    throw new DomainRuleError("status", `Unsupported task status: ${input.status}`);
  }
  if (!TASK_PRIORITIES.includes(input.priority ?? "normal")) {
    throw new DomainRuleError("priority", `Unsupported task priority: ${input.priority}`);
  }

  const status = input.status ?? "open";
  const completedAt =
    input.completedAt === undefined || input.completedAt === null
      ? null
      : parseUtcTimestamp(input.completedAt);
  validateTaskState(status, completedAt);
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    title: input.title,
    description:
      input.description === undefined || input.description === null
        ? null
        : createContentDocument(input.description.schemaVersion, input.description.doc),
    descriptionText: input.descriptionText ?? "",
    status,
    priority: input.priority ?? "normal",
    dueDate:
      input.dueDate === undefined || input.dueDate === null ? null : parseLocalDate(input.dueDate),
    completedAt,
    journalId:
      input.journalId === undefined || input.journalId === null
        ? null
        : parseEntityId(input.journalId),
    knowledgeItemId:
      input.knowledgeItemId === undefined || input.knowledgeItemId === null
        ? null
        : parseEntityId(input.knowledgeItemId),
    revision: parseRevision(0),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

export function markTaskDone(task: Task, clock: Clock): Task {
  const completedAt = nowUtc(clock);
  validateTaskState("done", completedAt);

  return {
    ...task,
    status: "done",
    completedAt,
    updatedAt: completedAt,
  };
}

export function reopenTask(task: Task, clock: Clock): Task {
  return {
    ...task,
    status: "open",
    completedAt: null,
    updatedAt: nowUtc(clock),
  };
}

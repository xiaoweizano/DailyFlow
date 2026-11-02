import {
  createContentDocument,
  nowUtc,
  parseEntityId,
  parseLocalDate,
  type Task,
  type TaskPriority,
} from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { TaskRepository } from "../ports/task-repository.js";
import {
  EntityIdSchema,
  JsonObjectSchema,
  LocalDateSchema,
  PositiveIntegerSchema,
} from "../validation.js";
import type { Clock } from "@dailyflow/domain";

const TaskPrioritySchema = z.custom<TaskPriority>(
  (value) => value === "low" || value === "normal" || value === "high" || value === "urgent",
  "Unsupported task priority.",
);

export const UpdateTaskInputSchema = z.object({
  taskId: EntityIdSchema,
  expectedRevision: PositiveIntegerSchema,
  title: z.string().trim().min(1).max(500).optional(),
  description: JsonObjectSchema.nullable().optional(),
  descriptionText: z.string().max(20_000).optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: LocalDateSchema.nullable().optional(),
  journalId: EntityIdSchema.nullable().optional(),
  knowledgeItemId: EntityIdSchema.nullable().optional(),
});

export interface UpdateTaskDependencies {
  readonly tasks: TaskRepository;
  readonly clock: Clock;
}

export async function updateTask(
  dependencies: UpdateTaskDependencies,
  rawInput: unknown,
): Promise<Result<Task, AppError>> {
  const parsed = UpdateTaskInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  try {
    const current = await dependencies.tasks.getById(parsed.data.taskId);
    if (current === null) {
      return err({
        code: "NOT_FOUND",
        entity: "task",
        id: parsed.data.taskId,
      });
    }

    const input = parsed.data;
    const description =
      input.description === undefined
        ? current.description
        : input.description === null
          ? null
          : createContentDocument(1, input.description);
    const updated: Task = {
      ...current,
      ...(input.title === undefined ? {} : { title: input.title }),
      description,
      ...(input.descriptionText === undefined ? {} : { descriptionText: input.descriptionText }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.dueDate === undefined
        ? {}
        : { dueDate: input.dueDate === null ? null : parseLocalDate(input.dueDate) }),
      ...(input.journalId === undefined
        ? {}
        : { journalId: input.journalId === null ? null : parseEntityId(input.journalId) }),
      ...(input.knowledgeItemId === undefined
        ? {}
        : {
            knowledgeItemId:
              input.knowledgeItemId === null ? null : parseEntityId(input.knowledgeItemId),
          }),
      updatedAt: nowUtc(dependencies.clock),
    };

    return ok(await dependencies.tasks.save(updated, parsed.data.expectedRevision));
  } catch (error) {
    return err(mapApplicationError(error, "task"));
  }
}

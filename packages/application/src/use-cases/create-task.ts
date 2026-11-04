import {
  createContentDocument,
  createTask as createTaskEntity,
  type Clock,
  type IdGenerator,
  type Task,
  type TaskPriority,
} from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { TaskRepository } from "../ports/task-repository.js";
import { EntityIdSchema, JsonObjectSchema, LocalDateSchema } from "../validation.js";

const TaskPrioritySchema = z.custom<TaskPriority>(
  (value) => value === "low" || value === "normal" || value === "high" || value === "urgent",
  "Unsupported task priority.",
);

export const CreateTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: JsonObjectSchema.nullable().optional(),
  descriptionText: z.string().max(20_000).optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: LocalDateSchema.nullable().optional(),
  journalId: EntityIdSchema.nullable().optional(),
  knowledgeItemId: EntityIdSchema.nullable().optional(),
});

export interface CreateTaskDependencies {
  readonly tasks: TaskRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export async function createTask(
  dependencies: CreateTaskDependencies,
  rawInput: unknown,
): Promise<Result<Task, AppError>> {
  const parsed = CreateTaskInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  try {
    const input = parsed.data;
    const task = createTaskEntity(
      {
        title: input.title,
        ...(input.description === undefined
          ? {}
          : {
              description:
                input.description === null ? null : createContentDocument(1, input.description),
            }),
        ...(input.descriptionText === undefined ? {} : { descriptionText: input.descriptionText }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
        ...(input.journalId === undefined ? {} : { journalId: input.journalId }),
        ...(input.knowledgeItemId === undefined ? {} : { knowledgeItemId: input.knowledgeItemId }),
      },
      dependencies,
    );
    return ok(await dependencies.tasks.save(task, null));
  } catch (error) {
    return err(mapApplicationError(error, "task"));
  }
}

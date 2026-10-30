import { nowUtc, type Clock, type Task } from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import type { AppError } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { TaskRepository } from "../ports/task-repository.js";
import { EntityIdSchema, PositiveIntegerSchema } from "../validation.js";

export const CompleteTaskInputSchema = z.object({
  taskId: EntityIdSchema,
  expectedRevision: PositiveIntegerSchema,
});

export interface CompleteTaskDependencies {
  readonly tasks: TaskRepository;
  readonly clock: Clock;
}

export async function completeTask(
  dependencies: CompleteTaskDependencies,
  rawInput: unknown,
): Promise<Result<Task, AppError>> {
  const parsed = CompleteTaskInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  try {
    return ok(
      await dependencies.tasks.complete(
        parsed.data.taskId,
        nowUtc(dependencies.clock),
        parsed.data.expectedRevision,
      ),
    );
  } catch (error) {
    return err(mapApplicationError(error, "task"));
  }
}

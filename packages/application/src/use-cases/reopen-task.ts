import { reopenTask as reopenTaskDomain, type Clock, type Task } from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { TaskRepository } from "../ports/task-repository.js";
import { EntityIdSchema, PositiveIntegerSchema } from "../validation.js";

export const ReopenTaskInputSchema = z.object({
  taskId: EntityIdSchema,
  expectedRevision: PositiveIntegerSchema,
});

export interface ReopenTaskDependencies {
  readonly tasks: TaskRepository;
  readonly clock: Clock;
}

export async function reopenTask(
  dependencies: ReopenTaskDependencies,
  rawInput: unknown,
): Promise<Result<Task, AppError>> {
  const parsed = ReopenTaskInputSchema.safeParse(rawInput);
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

    return ok(
      await dependencies.tasks.save(
        reopenTaskDomain(current, dependencies.clock),
        parsed.data.expectedRevision,
      ),
    );
  } catch (error) {
    return err(mapApplicationError(error, "task"));
  }
}

import {
  buildTaskListQuery,
  completeTask,
  createTask,
  reopenTask,
  updateTask,
  type Page,
  type PageRequest,
  type TaskListView,
  type TaskRepository,
} from "@dailyflow/application";
import type {
  Clock,
  ContentDocument,
  IdGenerator,
  LocalDate,
  Task,
  TaskPriority,
} from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";

export interface TaskUpdate {
  readonly title?: string;
  readonly description?: ContentDocument | null;
  readonly descriptionText?: string;
  readonly priority?: TaskPriority;
  readonly dueDate?: LocalDate | null;
  readonly journalId?: Task["journalId"];
  readonly knowledgeItemId?: Task["knowledgeItemId"];
}

export interface TaskCreateInput {
  readonly title: string;
  readonly description?: ContentDocument | null;
  readonly descriptionText?: string;
  readonly priority?: TaskPriority;
  readonly dueDate?: LocalDate | null;
  readonly journalId?: Task["journalId"];
  readonly knowledgeItemId?: Task["knowledgeItemId"];
}

export interface TaskRuntimeServices {
  list(view: TaskListView, page?: PageRequest): Promise<Page<Task>>;
  create(input: TaskCreateInput): Promise<Result<Task, AppError>>;
  complete(task: Task): Promise<Result<Task, AppError>>;
  reopen(task: Task): Promise<Result<Task, AppError>>;
  update(task: Task, changes: TaskUpdate): Promise<Result<Task, AppError>>;
}

export interface TaskRuntimeDependencies {
  readonly tasks: TaskRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly today: () => LocalDate;
}

export function createTaskRuntimeServices(
  dependencies: TaskRuntimeDependencies,
): TaskRuntimeServices {
  return {
    list: (view, page = {}) =>
      dependencies.tasks.list(buildTaskListQuery(view, dependencies.today(), page)),
    create: (input) =>
      createTask(
        {
          tasks: dependencies.tasks,
          clock: dependencies.clock,
          ids: dependencies.ids,
        },
        {
          ...input,
          ...(input.description === undefined
            ? {}
            : { description: input.description?.doc ?? null }),
        },
      ),
    complete: (task) =>
      completeTask(dependencies, {
        taskId: task.id,
        expectedRevision: task.revision,
      }),
    reopen: (task) =>
      reopenTask(dependencies, {
        taskId: task.id,
        expectedRevision: task.revision,
      }),
    update: (task, changes) =>
      updateTask(dependencies, {
        taskId: task.id,
        expectedRevision: task.revision,
        ...changes,
        ...(changes.description === undefined
          ? {}
          : { description: changes.description?.doc ?? null }),
      }),
  };
}

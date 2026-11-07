import type { TaskListView } from "@dailyflow/application";
import type { LocalDate, Task, TaskPriority } from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  SegmentedControl,
} from "@dailyflow/ui";
import {
  AlertCircle,
  Check,
  CheckSquare2,
  Circle,
  Link2,
  ListChecks,
  Plus,
  RotateCw,
  SquarePen,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, isLocalDate } from "../date-utils.js";
import { useAppText, type AppText } from "../preferences/use-app-text.js";
import { taskFieldErrors, type TaskCreateInput, type TaskUpdate } from "./task-services.js";

export interface TasksPageProps {
  readonly today?: string;
}

const taskPriorities: readonly TaskPriority[] = ["low", "normal", "high", "urgent"];

function priorityLabel(priority: TaskPriority, text: AppText): string {
  switch (priority) {
    case "low":
      return text("低", "Low");
    case "high":
      return text("高", "High");
    case "urgent":
      return text("紧急", "Urgent");
    default:
      return text("普通", "Normal");
  }
}

const priorityClasses: Record<TaskPriority, string> = {
  low: "border-border bg-surface-muted text-muted-foreground",
  normal: "border-border bg-surface text-foreground",
  high: "border-warning/30 bg-warning/10 text-foreground",
  urgent: "border-danger/30 bg-danger/10 text-danger",
};

interface NewTaskDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (input: TaskCreateInput) => Promise<Result<Task, AppError>>;
}

function NewTaskDialog({ open, onOpenChange, onCreate }: NewTaskDialogProps): React.JSX.Element {
  const text = useAppText();
  const [title, setTitle] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescriptionText("");
      setPriority("normal");
      setDueDate("");
      setTitleError(null);
      setDueDateError(null);
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextTitleError =
      title.trim() === "" ? text("请输入待办标题", "Enter a task title") : null;
    const nextDueDateError =
      dueDate !== "" && !isLocalDate(dueDate)
        ? text("请选择有效日期", "Choose a valid date")
        : null;
    setTitleError(nextTitleError);
    setDueDateError(nextDueDateError);
    setFormError(null);
    if (nextTitleError !== null || nextDueDateError !== null) {
      return;
    }
    setSaving(true);
    try {
      const created = await onCreate({
        title: title.trim(),
        descriptionText,
        priority,
        ...(dueDate === "" ? {} : { dueDate: dueDate as LocalDate }),
      });
      if (!created.ok) {
        const fieldErrors = taskFieldErrors(
          created.error,
          text(
            "待办创建失败，请检查标题和日期后重试",
            "The task could not be created. Check the title and date, then try again.",
          ),
        );
        setTitleError(fieldErrors.title ?? null);
        setDueDateError(fieldErrors.dueDate ?? null);
        setFormError(fieldErrors.form ?? null);
        return;
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="new-task-description">
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>{text("新建待办", "New task")}</DialogTitle>
            <DialogDescription id="new-task-description">
              {text(
                "记录需要跟进的工作，可稍后补充关联信息。",
                "Capture work that needs follow-up. You can add links and details later.",
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            {text("任务标题", "Task title")}
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.currentTarget.value);
                setTitleError(null);
              }}
              maxLength={500}
              autoFocus
              aria-invalid={titleError !== null}
              aria-describedby={titleError === null ? undefined : "new-task-title-error"}
            />
            {titleError === null ? null : (
              <p id="new-task-title-error" role="alert" className="text-xs text-danger">
                {titleError}
              </p>
            )}
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            {text("任务备注", "Notes")}
            <textarea
              value={descriptionText}
              onChange={(event) => setDescriptionText(event.currentTarget.value)}
              rows={3}
              maxLength={20_000}
              className="min-h-20 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={text(
                "补充上下文、验收条件或下一步",
                "Add context, acceptance criteria, or next steps",
              )}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              {text("优先级", "Priority")}
              <select
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value as TaskPriority)}
                className="h-9 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {taskPriorities.map((value) => (
                  <option key={value} value={value}>
                    {priorityLabel(value, text)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              {text("截止日期", "Due date")}
              <Input
                aria-label={text("待办截止日期", "Task due date")}
                type="date"
                value={dueDate}
                onChange={(event) => {
                  setDueDate(event.currentTarget.value);
                  setDueDateError(null);
                }}
                className="font-mono text-xs"
                aria-invalid={dueDateError !== null}
                aria-describedby={dueDateError === null ? undefined : "new-task-due-date-error"}
              />
              {dueDateError === null ? null : (
                <p id="new-task-due-date-error" role="alert" className="text-xs text-danger">
                  {dueDateError}
                </p>
              )}
            </label>
          </div>
          {formError === null ? null : (
            <p
              role="alert"
              className="border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger"
            >
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {text("取消", "Cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <RotateCw aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="size-4" />
              )}
              {text("创建待办", "Create task")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TaskDetailDialogProps {
  readonly task: Task | null;
  readonly onClose: () => void;
  readonly onSave: (task: Task, changes: TaskUpdate) => Promise<void>;
  readonly onUnlink: (task: Task) => Promise<void>;
}

function TaskDetailDialog({
  task,
  onClose,
  onSave,
  onUnlink,
}: TaskDetailDialogProps): React.JSX.Element {
  const text = useAppText();
  const [title, setTitle] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [journalDate, setJournalDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescriptionText(task?.descriptionText ?? "");
    setPriority(task?.priority ?? "normal");
    setDueDate(task?.dueDate ?? "");
    setJournalDate(
      task?.journalId === null || task?.journalId === undefined ? "" : (task.dueDate ?? ""),
    );
  }, [task]);

  async function handleSave(): Promise<void> {
    if (task === null || title.trim() === "") {
      return;
    }
    setSaving(true);
    try {
      await onSave(task, {
        title: title.trim(),
        descriptionText,
        priority,
        dueDate: dueDate === "" ? null : (dueDate as LocalDate),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={task !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent aria-describedby="task-detail-description">
        <DialogHeader>
          <DialogTitle>{text("待办详情", "Task details")}</DialogTitle>
          <DialogDescription id="task-detail-description">
            {text(
              "编辑任务内容、优先级和日期。关联日志用于追溯任务来源。",
              "Edit the task, priority, and date. Linked journals preserve where the task came from.",
            )}
          </DialogDescription>
        </DialogHeader>
        {task === null ? null : (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 border border-border bg-surface-muted/60 px-3 py-2">
              <span
                className={`inline-flex size-2 rounded-full ${
                  task.status === "done" ? "bg-success" : "bg-warning"
                }`}
                aria-hidden="true"
              />
              <span className="truncate text-xs text-muted-foreground">
                {task.status === "done" ? text("已完成", "Completed") : text("待处理", "Open")} · r
                {task.revision}
              </span>
              <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                {task.id.slice(0, 8)}
              </span>
            </div>

            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              {text("任务标题", "Task title")}
              <Input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              {text("任务备注", "Notes")}
              <textarea
                value={descriptionText}
                onChange={(event) => setDescriptionText(event.currentTarget.value)}
                rows={4}
                className="min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder={text(
                  "补充上下文、验收条件或下一步",
                  "Add context, acceptance criteria, or next steps",
                )}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                {text("优先级", "Priority")}
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.currentTarget.value as TaskPriority)}
                  className="h-9 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  {taskPriorities.map((value) => (
                    <option key={value} value={value}>
                      {priorityLabel(value, text)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                {text("截止日期", "Due date")}
                <Input
                  aria-label={text("待办截止日期", "Task due date")}
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.currentTarget.value)}
                  className="font-mono text-xs"
                />
              </label>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Link2 aria-hidden="true" className="size-4 text-primary" />
                <p className="text-xs font-semibold text-foreground">
                  {text("关联日志", "Linked journal")}
                </p>
              </div>
              {task.journalId === null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {text("当前任务没有关联日志。", "This task is not linked to a journal.")}
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="grid gap-1.5 text-xs font-medium text-foreground">
                    {text("关联日志日期", "Journal date")}
                    <Input
                      type="text"
                      value={journalDate}
                      onChange={(event) => setJournalDate(event.currentTarget.value)}
                      className="font-mono text-xs"
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void onUnlink(task);
                    }}
                  >
                    {text("解除关联", "Unlink")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {text("取消", "Cancel")}
          </Button>
          <Button
            disabled={task === null || saving || title.trim() === ""}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <RotateCw aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-4" />
            )}
            {text("保存待办", "Save task")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TasksPage({ today = currentLocalDate() }: TasksPageProps): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const currentDate = (isLocalDate(today) ? today : currentLocalDate()) as LocalDate;
  const [view, setView] = useState<TaskListView>("today");
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await services.tasks.list(view, {});
      setTasks(page.items);
    } catch {
      setTasks([]);
      setError(text("待办加载失败", "Tasks could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, [services.tasks, text, view]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks, reloadVersion]);

  function updateVisibleTask(nextTask: Task): void {
    setTasks((current) => current.map((item) => (item.id === nextTask.id ? nextTask : item)));
    setSelectedTask((current) => (current?.id === nextTask.id ? nextTask : current));
  }

  async function handleToggle(task: Task): Promise<void> {
    const result =
      task.status === "done"
        ? await services.tasks.reopen(task)
        : await services.tasks.complete(task);
    if (!result.ok) {
      setError(text("待办更新失败，请重试", "The task could not be updated. Try again."));
      return;
    }
    updateVisibleTask(result.value);
  }

  async function handleSave(task: Task, changes: TaskUpdate): Promise<void> {
    const result = await services.tasks.update(task, changes);
    if (!result.ok) {
      setError(text("待办保存失败，请重试", "The task could not be saved. Try again."));
      return;
    }
    updateVisibleTask(result.value);
    setSelectedTask(null);
  }

  async function handleUnlink(task: Task): Promise<void> {
    const result = await services.tasks.update(task, { journalId: null });
    if (!result.ok) {
      setError(text("解除关联失败，请重试", "The journal link could not be removed. Try again."));
      return;
    }
    updateVisibleTask(result.value);
  }

  async function handleCreate(input: TaskCreateInput): Promise<Result<Task, AppError>> {
    const result = await services.tasks.create(input);
    if (result.ok) {
      setReloadVersion((version) => version + 1);
    }
    return result;
  }

  const overdue = tasks.filter(
    (task) =>
      task.dueDate !== null &&
      task.dueDate < currentDate &&
      task.status !== "done" &&
      task.status !== "cancelled",
  ).length;

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Personal focus</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{text("待办", "Tasks")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(`${tasks.length} 项正在显示`, `${tasks.length} task(s) shown`)}
            {overdue > 0 ? text(` · ${overdue} 项已逾期`, ` · ${overdue} overdue`) : ""}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setNewTaskOpen(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {text("新建待办", "New task")}
          </Button>
          <SegmentedControl
            label={text("待办视图", "Task view")}
            options={[
              { label: text("今天", "Today"), value: "today" },
              { label: text("即将到期", "Upcoming"), value: "upcoming" },
              { label: text("全部", "All"), value: "all" },
              { label: text("已完成", "Completed"), value: "completed" },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      </header>

      {error === null ? null : (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center gap-3 border border-danger/25 bg-danger/5 px-4 py-3"
        >
          <AlertCircle aria-hidden="true" className="size-4 text-danger" />
          <p className="text-sm text-foreground">{error}</p>
          <button
            type="button"
            onClick={() => setReloadVersion((version) => version + 1)}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            {text("重试", "Try again")}
          </button>
        </div>
      )}

      <section aria-labelledby="task-list-title" className="mt-5 border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <ListChecks aria-hidden="true" className="size-4 text-primary" />
          <h2 id="task-list-title" className="text-sm font-semibold text-foreground">
            {text("任务清单", "Task list")}
          </h2>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{currentDate}</span>
        </div>
        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm">
            <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
            {text("正在加载待办", "Loading tasks")}
          </div>
        ) : tasks.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <CheckSquare2 aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">
                {text("这个视图没有待办", "No tasks in this view")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {text("切换视图查看其他任务。", "Switch views to see other tasks.")}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((task) => {
              const isDone = task.status === "done";
              const isOverdue =
                task.dueDate !== null &&
                task.dueDate < currentDate &&
                !isDone &&
                task.status !== "cancelled";
              return (
                <li key={task.id}>
                  <article
                    aria-label={`${text("待办：", "Task: ")}${task.title}`}
                    className="group flex min-w-0 items-start gap-3 px-4 py-3 hover:bg-surface-muted/45"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={
                        isDone
                          ? text("重新打开待办", "Reopen task")
                          : text("完成待办", "Complete task")
                      }
                      title={
                        isDone
                          ? text("重新打开待办", "Reopen task")
                          : text("完成待办", "Complete task")
                      }
                      onClick={() => void handleToggle(task)}
                      className="mt-0.5 shrink-0 px-2 [&_svg]:size-3.5"
                    >
                      {isDone ? (
                        <CheckSquare2 aria-hidden="true" className="text-success" />
                      ) : (
                        <Circle aria-hidden="true" className="text-muted-foreground" />
                      )}
                      {isDone ? text("重新打开", "Reopen") : text("完成", "Complete")}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`break-words text-sm font-medium ${
                          isDone ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.descriptionText ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {task.descriptionText}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-[3px] border px-1.5 py-0.5 text-[10px] ${priorityClasses[task.priority]}`}
                        >
                          {priorityLabel(task.priority, text)}
                        </span>
                        {task.dueDate ? (
                          <span
                            className={`font-mono text-[10px] ${
                              isOverdue ? "text-danger" : "text-muted-foreground"
                            }`}
                          >
                            {isOverdue
                              ? text("已逾期 · ", "Overdue · ")
                              : text("截止 · ", "Due · ")}
                            {task.dueDate}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {text("无截止日期", "No due date")}
                          </span>
                        )}
                        {task.journalId === null ? null : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                            <Link2 aria-hidden="true" className="size-3" />
                            {text("关联日志", "Linked journal")}
                          </span>
                        )}
                      </div>
                    </div>
                    <IconButton
                      label={text("打开待办详情", "Open task details")}
                      onClick={() => setSelectedTask(task)}
                      className="mt-0.5"
                    >
                      <SquarePen aria-hidden="true" />
                    </IconButton>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <TaskDetailDialog
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSave={handleSave}
        onUnlink={handleUnlink}
      />
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onCreate={handleCreate} />
    </div>
  );
}

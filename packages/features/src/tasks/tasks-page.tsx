import type { TaskListView } from "@dailyflow/application";
import type { LocalDate, Task, TaskPriority } from "@dailyflow/domain";
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
  RotateCw,
  SquarePen,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, isLocalDate } from "../date-utils.js";
import type { TaskUpdate } from "./task-services.js";

export interface TasksPageProps {
  readonly today?: string;
}

const priorityLabels: Record<TaskPriority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

const priorityClasses: Record<TaskPriority, string> = {
  low: "border-border bg-surface-muted text-muted-foreground",
  normal: "border-border bg-surface text-foreground",
  high: "border-warning/30 bg-warning/10 text-foreground",
  urgent: "border-danger/30 bg-danger/10 text-danger",
};

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
          <DialogTitle>待办详情</DialogTitle>
          <DialogDescription id="task-detail-description">
            编辑任务内容、优先级和日期。关联日志用于追溯任务来源。
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
                {task.status === "done" ? "已完成" : "待处理"} · r{task.revision}
              </span>
              <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                {task.id.slice(0, 8)}
              </span>
            </div>

            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              任务标题
              <Input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              任务备注
              <textarea
                value={descriptionText}
                onChange={(event) => setDescriptionText(event.currentTarget.value)}
                rows={4}
                className="min-h-24 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
                placeholder="补充上下文、验收条件或下一步"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                优先级
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.currentTarget.value as TaskPriority)}
                  className="h-9 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                截止日期
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.currentTarget.value)}
                  className="font-mono text-xs"
                />
              </label>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Link2 aria-hidden="true" className="size-4 text-primary" />
                <p className="text-xs font-semibold text-foreground">关联日志</p>
              </div>
              {task.journalId === null ? (
                <p className="mt-2 text-xs text-muted-foreground">当前任务没有关联日志。</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="grid gap-1.5 text-xs font-medium text-foreground">
                    关联日志日期
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
                    解除关联
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
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
            保存待办
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TasksPage({ today = currentLocalDate() }: TasksPageProps): React.JSX.Element {
  const services = useAppServices();
  const currentDate = (isLocalDate(today) ? today : currentLocalDate()) as LocalDate;
  const [view, setView] = useState<TaskListView>("today");
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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
      setError("待办加载失败");
    } finally {
      setLoading(false);
    }
  }, [services.tasks, view]);

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
      setError("待办更新失败，请重试");
      return;
    }
    updateVisibleTask(result.value);
  }

  async function handleSave(task: Task, changes: TaskUpdate): Promise<void> {
    const result = await services.tasks.update(task, changes);
    if (!result.ok) {
      setError("待办保存失败，请重试");
      return;
    }
    updateVisibleTask(result.value);
    setSelectedTask(null);
  }

  async function handleUnlink(task: Task): Promise<void> {
    const result = await services.tasks.update(task, { journalId: null });
    if (!result.ok) {
      setError("解除关联失败，请重试");
      return;
    }
    updateVisibleTask(result.value);
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
          <h1 className="mt-1 text-2xl font-semibold text-foreground">待办</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.length} 项正在显示
            {overdue > 0 ? ` · ${overdue} 项已逾期` : ""}
          </p>
        </div>
        <SegmentedControl
          label="待办视图"
          options={[
            { label: "今天", value: "today" },
            { label: "即将到期", value: "upcoming" },
            { label: "全部", value: "all" },
            { label: "已完成", value: "completed" },
          ]}
          value={view}
          onChange={setView}
        />
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
            重试
          </button>
        </div>
      )}

      <section aria-labelledby="task-list-title" className="mt-5 border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <ListChecks aria-hidden="true" className="size-4 text-primary" />
          <h2 id="task-list-title" className="text-sm font-semibold text-foreground">
            任务清单
          </h2>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{currentDate}</span>
        </div>
        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm">
            <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
            正在加载待办
          </div>
        ) : tasks.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <CheckSquare2 aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">这个视图没有待办</p>
              <p className="mt-1 text-xs text-muted-foreground">切换视图查看其他任务。</p>
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
                    aria-label={`待办：${task.title}`}
                    className="group flex min-w-0 items-start gap-3 px-4 py-3 hover:bg-surface-muted/45"
                  >
                    <IconButton
                      label={isDone ? "重新打开待办" : "完成待办"}
                      onClick={() => void handleToggle(task)}
                      className="mt-0.5"
                    >
                      {isDone ? (
                        <CheckSquare2 aria-hidden="true" className="text-success" />
                      ) : (
                        <Circle aria-hidden="true" className="text-muted-foreground" />
                      )}
                    </IconButton>
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
                          {priorityLabels[task.priority]}
                        </span>
                        {task.dueDate ? (
                          <span
                            className={`font-mono text-[10px] ${
                              isOverdue ? "text-danger" : "text-muted-foreground"
                            }`}
                          >
                            {isOverdue ? "已逾期 · " : "截止 · "}
                            {task.dueDate}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">无截止日期</span>
                        )}
                        {task.journalId === null ? null : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                            <Link2 aria-hidden="true" className="size-3" />
                            关联日志
                          </span>
                        )}
                      </div>
                    </div>
                    <IconButton
                      label="打开待办详情"
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
    </div>
  );
}

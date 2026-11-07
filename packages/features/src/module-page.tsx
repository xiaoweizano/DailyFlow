import { ArrowRight, CalendarDays, SearchX } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { SegmentedControl } from "@dailyflow/ui";

import { appModules, type AppModuleId } from "./app-modules.js";
import { useAppMessages } from "./preferences/use-app-messages.js";
import { useAppText } from "./preferences/use-app-text.js";

interface ModulePageProps {
  moduleId: AppModuleId | "settings";
}

const emptyCopy: Record<
  AppModuleId | "settings",
  {
    readonly zhCN: { readonly title: string; readonly detail: string };
    readonly enUS: { readonly title: string; readonly detail: string };
  }
> = {
  dashboard: {
    zhCN: {
      title: "今天还没有记录",
      detail: "打开今日日志，开始整理正在进行的工作。",
    },
    enUS: {
      title: "No entry for today yet",
      detail: "Open today's journal and start capturing the work in progress.",
    },
  },
  journal: {
    zhCN: {
      title: "这一天还没有内容",
      detail: "正文、结构化块和历史版本将在这里呈现。",
    },
    enUS: {
      title: "No content for this date yet",
      detail: "Journal content, structured blocks, and version history will appear here.",
    },
  },
  timeline: {
    zhCN: {
      title: "还没有可回顾的记录",
      detail: "持续记录后，日期轨迹与热力图会在这里汇总。",
    },
    enUS: {
      title: "No activity to review yet",
      detail: "Your date trail and activity heatmap will build as you keep writing.",
    },
  },
  knowledge: {
    zhCN: {
      title: "知识库为空",
      detail: "从日志沉淀的问题、经验与解决方案会集中在这里。",
    },
    enUS: {
      title: "The knowledge base is empty",
      detail: "Problems, lessons, and solutions saved from journals will collect here.",
    },
  },
  tasks: {
    zhCN: {
      title: "没有待办事项",
      detail: "个人任务会按状态和日期组织在这个视图中。",
    },
    enUS: {
      title: "No tasks",
      detail: "Personal tasks are organized by status and date in this view.",
    },
  },
  search: {
    zhCN: {
      title: "输入关键词开始搜索",
      detail: "结果将同时覆盖日志、知识和待办。",
    },
    enUS: {
      title: "Enter a keyword to search",
      detail: "Results cover journals, knowledge, and tasks together.",
    },
  },
  analytics: {
    zhCN: {
      title: "还没有可统计的数据",
      detail: "周报、月报和年度总结会随记录逐步形成。",
    },
    enUS: {
      title: "No analytics data yet",
      detail: "Weekly, monthly, and annual reports form as you add entries.",
    },
  },
  data: {
    zhCN: {
      title: "数据管理尚未接入",
      detail: "TXT 导入、导出、备份与恢复将在这里统一管理。",
    },
    enUS: {
      title: "Data management is not available here",
      detail: "TXT import, export, backup, and restore are managed from the Data workspace.",
    },
  },
  settings: {
    zhCN: {
      title: "使用默认设置",
      detail: "主题、快捷键、保存策略和 AI 扩展会在这里管理。",
    },
    enUS: {
      title: "Using default settings",
      detail: "Theme, shortcuts, save behavior, and AI extensions are managed here.",
    },
  },
};

function todayPath(): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `/journal/${date}`;
}

export function ModulePage({ moduleId }: ModulePageProps): React.JSX.Element {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { locale, messages } = useAppMessages();
  const text = useAppText();
  const module =
    moduleId === "settings"
      ? {
          label: messages.shell.settings,
          eyebrow: "Settings",
          description: text(
            "管理当前设备的 DailyFlow 偏好。",
            "Manage DailyFlow preferences for this device.",
          ),
        }
      : {
          label: messages.navigation[moduleId],
          eyebrow: appModules.find((candidate) => candidate.id === moduleId)?.eyebrow ?? moduleId,
          description: messages.moduleDescriptions[moduleId],
        };
  const copy = emptyCopy[moduleId][locale === "en-US" ? "enUS" : "zhCN"];
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }),
    [locale],
  );
  const selectedDate =
    moduleId === "journal" && params.date ? params.date : dateFormatter.format(new Date());
  const query = searchParams.get("q");

  return (
    <div className="df-page-grid">
      <section className="df-page-main" aria-labelledby="page-title">
        <header className="border-b border-border pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
              {module.eyebrow}
            </p>
            <span className="size-1 rounded-full bg-border-strong" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">{selectedDate}</p>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1
                id="page-title"
                className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-tight tracking-normal text-foreground"
              >
                {module.label}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {module.description}
              </p>
            </div>
            {moduleId === "dashboard" || moduleId === "journal" ? (
              <Link
                to={todayPath()}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-primary bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
              >
                {text("今日日志", "Today's journal")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        </header>

        <div className="py-6">
          {moduleId === "timeline" ? (
            <div className="mb-6">
              <SegmentedControl
                label={text("时间视图", "Time view")}
                options={[
                  { label: text("月历", "Calendar"), value: "calendar" },
                  { label: text("时间线", "Timeline view"), value: "timeline" },
                  { label: text("热力图", "Heatmap"), value: "heatmap" },
                ]}
                value="calendar"
                onChange={() => undefined}
              />
            </div>
          ) : null}

          <div className="df-dot-field min-h-72 rounded-[var(--radius-panel)] border border-dashed border-border-strong bg-surface/75 p-6 sm:p-8">
            <div className="flex max-w-md flex-col items-start">
              <span className="mb-4 grid size-10 place-items-center rounded-[var(--radius-panel)] border border-border bg-surface text-primary shadow-sm">
                <CalendarDays aria-hidden="true" className="size-5" strokeWidth={1.7} />
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                {moduleId === "search" && query ? `“${query}”` : copy.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.detail}</p>
              {moduleId === "dashboard" ? (
                <Link
                  to={todayPath()}
                  className="mt-5 inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3.5 text-sm font-medium text-foreground shadow-sm hover:border-primary/45 hover:bg-surface-muted"
                >
                  {text("开始记录", "Start writing")}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <aside className="df-context-panel" aria-label={text("上下文信息", "Context")}>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Current context
        </p>
        <dl className="mt-5 grid gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">
              {text("当前位置", "Current location")}
            </dt>
            <dd className="mt-1 font-medium text-foreground">{module.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{text("日期", "Date")}</dt>
            <dd className="mt-1 font-mono text-[13px] text-foreground">{selectedDate}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{text("数据状态", "Data status")}</dt>
            <dd className="mt-1 flex items-center gap-2 text-foreground">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {text("本地可用", "Available locally")}
            </dd>
          </div>
        </dl>
        <div className="mt-8 border-t border-border pt-5">
          <p className="text-xs leading-5 text-muted-foreground">
            {text(
              "结构化信息会在真实数据接入后出现在此面板。",
              "Structured context will appear here when data is available.",
            )}
          </p>
        </div>
      </aside>
    </div>
  );
}

export function NotFoundPage(): React.JSX.Element {
  const text = useAppText();

  return (
    <section className="grid min-h-full place-items-center px-6 py-16" aria-labelledby="not-found">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-[var(--radius-panel)] border border-border bg-surface text-muted-foreground shadow-sm">
          <SearchX aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary">404</p>
        <h1 id="not-found" className="mt-2 text-2xl font-semibold text-foreground">
          {text("页面不存在", "Page not found")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {text(
            "当前地址无法匹配 DailyFlow 中的页面。",
            "This address does not match a page in DailyFlow.",
          )}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-[var(--radius-control)] border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          {text("返回工作台", "Back to workbench")}
        </Link>
      </div>
    </section>
  );
}

import { ArrowRight, CalendarDays, SearchX } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { SegmentedControl } from "@dailyflow/ui";

import { appModules, type AppModuleId } from "./app-modules.js";

interface ModulePageProps {
  moduleId: AppModuleId | "settings";
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const emptyCopy: Record<AppModuleId | "settings", { title: string; detail: string }> = {
  dashboard: {
    title: "今天还没有记录",
    detail: "打开今日日志，开始整理正在进行的工作。",
  },
  journal: {
    title: "这一天还没有内容",
    detail: "正文、结构化块和历史版本将在这里呈现。",
  },
  timeline: {
    title: "还没有可回顾的记录",
    detail: "持续记录后，日期轨迹与热力图会在这里汇总。",
  },
  knowledge: {
    title: "知识库为空",
    detail: "从日志沉淀的问题、经验与解决方案会集中在这里。",
  },
  tasks: {
    title: "没有待办事项",
    detail: "个人任务会按状态和日期组织在这个视图中。",
  },
  search: {
    title: "输入关键词开始搜索",
    detail: "结果将同时覆盖日志、知识和待办。",
  },
  analytics: {
    title: "还没有可统计的数据",
    detail: "周报、月报和年度总结会随记录逐步形成。",
  },
  data: {
    title: "数据管理尚未接入",
    detail: "TXT 导入、导出、备份与恢复将在这里统一管理。",
  },
  settings: {
    title: "使用默认设置",
    detail: "主题、快捷键、保存策略和 AI 扩展会在这里管理。",
  },
};

function moduleMeta(moduleId: AppModuleId | "settings") {
  if (moduleId === "settings") {
    return {
      label: "设置",
      eyebrow: "Settings",
      description: "管理当前设备的 DailyFlow 偏好。",
    };
  }

  return appModules.find((module) => module.id === moduleId) ?? appModules[0];
}

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
  const module = moduleMeta(moduleId);
  const copy = emptyCopy[moduleId];
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
                今日日志
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        </header>

        <div className="py-6">
          {moduleId === "timeline" ? (
            <div className="mb-6">
              <SegmentedControl
                label="时间视图"
                options={[
                  { label: "月历", value: "calendar" },
                  { label: "时间线", value: "timeline" },
                  { label: "热力图", value: "heatmap" },
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
                  开始记录
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <aside className="df-context-panel" aria-label="上下文信息">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          Current context
        </p>
        <dl className="mt-5 grid gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">当前位置</dt>
            <dd className="mt-1 font-medium text-foreground">{module.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">日期</dt>
            <dd className="mt-1 font-mono text-[13px] text-foreground">{selectedDate}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">数据状态</dt>
            <dd className="mt-1 flex items-center gap-2 text-foreground">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              本地可用
            </dd>
          </div>
        </dl>
        <div className="mt-8 border-t border-border pt-5">
          <p className="text-xs leading-5 text-muted-foreground">
            结构化信息会在真实数据接入后出现在此面板。
          </p>
        </div>
      </aside>
    </div>
  );
}

export function NotFoundPage(): React.JSX.Element {
  return (
    <section className="grid min-h-full place-items-center px-6 py-16" aria-labelledby="not-found">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-[var(--radius-panel)] border border-border bg-surface text-muted-foreground shadow-sm">
          <SearchX aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary">404</p>
        <h1 id="not-found" className="mt-2 text-2xl font-semibold text-foreground">
          页面不存在
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          当前地址无法匹配 DailyFlow 中的页面。
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-[var(--radius-control)] border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          返回工作台
        </Link>
      </div>
    </section>
  );
}

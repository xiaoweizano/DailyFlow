import type { JournalLookup, JournalSummary } from "@dailyflow/application";
import type { LocalDate } from "@dailyflow/domain";
import { Button } from "@dailyflow/ui";
import { AlertCircle, ArrowRight, LibraryBig, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, shiftLocalDate } from "../date-utils.js";
import { JournalList } from "../journal/journal-list.js";
import { ActivityHeatmap } from "./activity-heatmap.js";
import { TodayJournalPanel } from "./today-journal-panel.js";
import { TodayTasksPanel } from "./today-tasks-panel.js";

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export interface DashboardPageProps {
  readonly today?: string;
}

interface DashboardState {
  readonly lookup: JournalLookup;
  readonly summaries: readonly JournalSummary[];
}

function DashboardLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      className="grid min-h-full place-items-center p-6 text-sm text-muted-foreground"
    >
      <span className="flex items-center gap-2">
        <RotateCw aria-hidden="true" className="size-4 animate-spin" />
        正在加载工作台
      </span>
    </div>
  );
}

export function DashboardPage({
  today = currentLocalDate(),
}: DashboardPageProps): React.JSX.Element {
  const services = useAppServices();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromDate = shiftLocalDate(today, -83) as LocalDate;
      const [lookupResult, summaries] = await Promise.all([
        services.journal.get({ journalDate: today, timezone: localTimezone }),
        services.journal.list({
          fromDate,
          toDate: today as LocalDate,
          limit: 100,
        }),
      ]);

      if (!lookupResult.ok) {
        setError("工作台加载失败");
        setState(null);
        return;
      }

      setState({
        lookup: lookupResult.value,
        summaries: summaries.items,
      });
    } catch {
      setError("工作台加载失败");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [services.journal, today]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, reloadVersion]);

  if (loading) {
    return <DashboardLoading />;
  }

  if (error !== null || state === null) {
    return (
      <section className="grid min-h-full place-items-center p-6" aria-labelledby="dashboard-error">
        <div role="alert" className="w-full max-w-md border border-danger/25 bg-danger/5 p-5">
          <AlertCircle aria-hidden="true" className="size-5 text-danger" />
          <h1 id="dashboard-error" className="mt-3 text-base font-semibold text-foreground">
            工作台加载失败
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            无法读取本地日志，请检查存储状态后重试。
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setReloadVersion((version) => version + 1)}
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            重试
          </Button>
        </div>
      </section>
    );
  }

  const recentActivity = state.summaries.filter((summary) => summary.journalDate !== today);

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-primary">Daily workspace</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <time dateTime={today}>{today}</time>
            <span aria-hidden="true"> · </span>
            从当前记录继续推进
          </p>
        </div>
        <Link
          to={`/journal/${today}`}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-primary bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          打开今日日志
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 content-start gap-5">
          <TodayJournalPanel lookup={state.lookup} />

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="min-w-0 border border-border bg-surface p-4">
              <JournalList summaries={recentActivity.slice(0, 6)} />
            </section>
            <section className="min-w-0 border border-border bg-surface p-4">
              <ActivityHeatmap
                endDate={today}
                summaries={state.summaries}
                todayHasJournal={state.lookup.isPersisted}
              />
            </section>
          </div>
        </div>

        <aside aria-label="工作台侧栏" className="grid content-start gap-5">
          <TodayTasksPanel />
          <section
            aria-labelledby="recent-knowledge-title"
            className="border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Knowledge</p>
                <h2
                  id="recent-knowledge-title"
                  className="mt-1 text-sm font-semibold text-foreground"
                >
                  最近知识
                </h2>
              </div>
              <LibraryBig aria-hidden="true" className="size-4 shrink-0 text-primary" />
            </div>
            <p className="mt-6 text-sm font-medium text-foreground">暂无最近知识</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              从日志沉淀的问题与解决方案会出现在这里。
            </p>
            <Link
              to="/knowledge"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              打开知识库
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

import {
  resolveAnalyticsPeriod,
  shiftAnalyticsPeriod,
  type AnalyticsDailyActivity,
  type AnalyticsPeriod,
  type AnalyticsSummary,
  type ReportDraft,
} from "@dailyflow/application";
import type { ReportPeriodType, Report } from "@dailyflow/domain";
import { Button, IconButton, SegmentedControl } from "@dailyflow/ui";
import {
  AlertCircle,
  BarChart3,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Lightbulb,
  RotateCw,
  Tags,
  CheckSquare2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, isLocalDate } from "../date-utils.js";
import type { ReportEditorModel } from "./analytics-services.js";
import { ReportEditor } from "./report-editor.js";
import { StatTile } from "./stat-tile.js";

const periodOptions = [
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "年", value: "year" },
] as const satisfies ReadonlyArray<{ label: string; value: ReportPeriodType }>;

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export interface AnalyticsPageProps {
  readonly today?: string;
  readonly timezone?: string;
}

function isPeriodType(value: string | undefined): value is ReportPeriodType {
  return value === "week" || value === "month" || value === "year";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function analyticsPath(period: AnalyticsPeriod, reportOpen: boolean): string {
  const pathname = `/analytics/${period.periodType}/${period.start}`;
  return reportOpen ? `${pathname}?report=1` : pathname;
}

function reportModel(
  report: Report | null,
  draft: ReportDraft,
  period: AnalyticsPeriod,
): ReportEditorModel {
  if (report === null) {
    return {
      title: draft.title,
      content: draft.content,
      projectionVersion: 1,
      stats: draft.stats,
      expectedRevision: null,
      key: `new:${period.periodType}:${period.start}`,
    };
  }

  return {
    title: report.title,
    content: report.content,
    projectionVersion: report.projectionVersion,
    stats: report.stats,
    expectedRevision: report.revision,
    key: `${report.id}:${report.revision}`,
  };
}

function ActivityChart({
  activity,
}: {
  readonly activity: readonly AnalyticsDailyActivity[];
}): React.JSX.Element {
  const maximum = Math.max(
    1,
    ...activity.map((day) => Math.max(day.journalCount, day.tasksCompleted)),
  );

  return (
    <section aria-labelledby="analytics-trend-title" className="border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Activity</p>
          <h2 id="analytics-trend-title" className="mt-1 text-sm font-semibold text-foreground">
            每日趋势
          </h2>
        </div>
        <BarChart3 aria-hidden="true" className="size-4 text-primary" />
      </div>
      <div className="mt-5 flex h-44 items-end gap-1.5 border-b border-border px-1">
        {activity.map((day) => {
          const journalHeight = (day.journalCount / maximum) * 100;
          const taskHeight = (day.tasksCompleted / maximum) * 100;
          return (
            <div
              key={day.date}
              aria-label={`${day.date}：${day.journalCount} 篇日志，${day.tasksCompleted} 个任务完成`}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
            >
              <span
                aria-hidden="true"
                className="w-1.5 rounded-t-sm bg-primary"
                style={{ height: `${Math.max(day.journalCount > 0 ? 8 : 2, journalHeight)}%` }}
              />
              <span
                aria-hidden="true"
                className="w-1.5 rounded-t-sm bg-success/70"
                style={{ height: `${Math.max(day.tasksCompleted > 0 ? 8 : 2, taskHeight)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 bg-primary" />
          日志篇数
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 bg-success/70" />
          完成任务
        </span>
      </div>
    </section>
  );
}

function AnalyticsLoading(): React.JSX.Element {
  return (
    <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm">
      <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
      正在生成分析
    </div>
  );
}

export function AnalyticsPage({
  today = currentLocalDate(),
  timezone = localTimezone,
}: AnalyticsPageProps): React.JSX.Element {
  const services = useAppServices();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const reportOpen = searchParams.get("report") === "1";
  const periodType = isPeriodType(params.periodType) ? params.periodType : "week";
  const start = params.start !== undefined && isLocalDate(params.start) ? params.start : today;
  const period = useMemo(
    () => resolveAnalyticsPeriod(periodType, start, timezone),
    [periodType, start, timezone],
  );
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [editorModel, setEditorModel] = useState<ReportEditorModel | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await services.analytics.getSummary(period));
    } catch {
      setSummary(null);
      setError("无法读取本地分析数据，请检查存储状态后重试。");
    } finally {
      setLoading(false);
    }
  }, [period, services.analytics]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, reloadVersion]);

  useEffect(() => {
    if (!reportOpen || summary === null) {
      setEditorModel(null);
      setReportError(null);
      return;
    }

    let cancelled = false;
    setReportLoading(true);
    setReportError(null);
    void services.analytics
      .getReport(period)
      .then((report) => {
        if (!cancelled) {
          setEditorModel(reportModel(report, services.analytics.generateDraft(summary), period));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEditorModel(null);
          setReportError("周期报告加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReportLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period, reportOpen, services.analytics, summary]);

  function navigatePeriod(nextPeriod: AnalyticsPeriod): void {
    navigate(analyticsPath(nextPeriod, reportOpen));
  }

  if (loading) {
    return (
      <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
        <AnalyticsLoading />
      </div>
    );
  }

  if (error !== null || summary === null) {
    return (
      <section className="grid min-h-full place-items-center p-6" aria-labelledby="analytics-error">
        <div role="alert" className="w-full max-w-md border border-danger/25 bg-danger/5 p-5">
          <AlertCircle aria-hidden="true" className="size-5 text-danger" />
          <h1 id="analytics-error" className="mt-3 text-base font-semibold text-foreground">
            分析加载失败
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{error}</p>
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

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase text-primary">Review and reflect</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">分析</h1>
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              {summary.period.start} 至 {summary.period.end}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="统计周期"
              options={periodOptions}
              value={periodType}
              onChange={(value) => {
                navigatePeriod(resolveAnalyticsPeriod(value, period.start, timezone));
              }}
            />
            <div className="inline-flex items-center gap-1">
              <IconButton
                label="上一周期"
                onClick={() => navigatePeriod(shiftAnalyticsPeriod(period, -1))}
              >
                <ChevronLeft aria-hidden="true" />
              </IconButton>
              <IconButton
                label="下一周期"
                onClick={() => navigatePeriod(shiftAnalyticsPeriod(period, 1))}
              >
                <ChevronRight aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-5">
        <section aria-label="统计概览" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="记录天数"
            value={formatNumber(summary.journalDays)}
            detail={`${formatNumber(summary.journalCount)} 篇日志`}
            icon={BookOpenText}
          />
          <StatTile
            label="记录字符"
            value={formatNumber(summary.characterCount)}
            detail="按纯文本字符统计"
            icon={FileText}
          />
          <StatTile
            label="完成任务"
            value={formatNumber(summary.tasksCompleted)}
            detail="按完成时间归入周期"
            icon={CheckSquare2}
          />
          <StatTile
            label="知识沉淀"
            value={formatNumber(summary.knowledgeItems)}
            detail={`${formatNumber(summary.issuesCreated)} 个问题 · ${formatNumber(summary.solutionsCreated)} 个方案`}
            icon={Lightbulb}
          />
        </section>

        {reportOpen ? (
          <>
            {reportLoading ? (
              <div role="status" className="border border-border bg-surface p-6 text-sm">
                正在加载周期报告
              </div>
            ) : reportError === null ? null : (
              <p role="alert" className="border border-danger/25 bg-danger/5 p-4 text-sm text-danger">
                {reportError}
              </p>
            )}
            {editorModel === null ? null : (
              <ReportEditor
                key={editorModel.key}
                period={summary.period}
                initialTitle={editorModel.title}
                initialContent={editorModel.content}
                projectionVersion={editorModel.projectionVersion}
                initialStats={editorModel.stats}
                expectedRevision={editorModel.expectedRevision}
                onClose={() => navigate(analyticsPath(period, false))}
              />
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border border-border bg-surface px-4 py-3">
            <Button
              size="sm"
              onClick={() => navigate(analyticsPath(period, true))}
            >
              <FileText aria-hidden="true" className="size-4" />
              打开周期报告
            </Button>
            <Button
              variant="secondary"
              size="sm"
              title="AI 辅助写作：未配置"
              aria-label="AI 辅助写作：未配置"
              disabled
            >
              <CircleHelp aria-hidden="true" className="size-4" />
              AI 辅助
            </Button>
            <p className="ml-auto text-xs text-muted-foreground">报告保存在本地，可随时继续编辑。</p>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <ActivityChart activity={summary.dailyActivity} />
          <div className="grid content-start gap-5">
            <section
              aria-labelledby="analytics-tags-title"
              className="border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">Tags</p>
                  <h2
                    id="analytics-tags-title"
                    className="mt-1 text-sm font-semibold text-foreground"
                  >
                    活跃标签
                  </h2>
                </div>
                <Tags aria-hidden="true" className="size-4 text-primary" />
              </div>
              {summary.activeTags.length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">当前周期没有活跃标签。</p>
              ) : (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {summary.activeTags.map((tag) => (
                    <li
                      key={tag.name}
                      className="inline-flex items-center gap-1.5 rounded-[3px] border border-border bg-surface-muted px-2 py-1 text-xs text-foreground"
                    >
                      {tag.name}
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {tag.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border border-border bg-surface p-4" aria-labelledby="task-review-title">
              <h2 id="task-review-title" className="text-sm font-semibold text-foreground">
                任务与沉淀
              </h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">完成任务</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatNumber(summary.tasksCompleted)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">新增问题</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatNumber(summary.issuesCreated)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">新增解决方案</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatNumber(summary.solutionsCreated)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>

        {summary.missingDataNotes.length === 0 ? null : (
          <section
            aria-label="数据说明"
            className="border border-border bg-surface-muted/55 px-4 py-3 text-xs leading-5 text-muted-foreground"
          >
            {summary.missingDataNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

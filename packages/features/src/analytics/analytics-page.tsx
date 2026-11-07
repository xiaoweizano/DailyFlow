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
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, isLocalDate } from "../date-utils.js";
import { useAppMessages } from "../preferences/use-app-messages.js";
import { useAppText } from "../preferences/use-app-text.js";
import type { ReportEditorModel } from "./analytics-services.js";
import {
  createReportDraftStore,
  reportPeriodKey,
  type ReportDraftStore,
} from "./report-draft-store.js";
import { ReportEditor } from "./report-editor.js";
import { StatTile } from "./stat-tile.js";

const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export interface AnalyticsPageProps {
  readonly today?: string;
  readonly timezone?: string;
}

function isPeriodType(value: string | undefined): value is ReportPeriodType {
  return value === "week" || value === "month" || value === "year";
}

function formatNumber(value: number, locale: "zh-CN" | "en-US"): string {
  return new Intl.NumberFormat(locale).format(value);
}

function analyticsPath(period: AnalyticsPeriod, reportOpen: boolean): string {
  const pathname = `/analytics/${period.periodType}/${period.start}`;
  return reportOpen ? `${pathname}?report=1` : pathname;
}

function reportModel(
  report: Report | null,
  draft: ReportDraft,
  period: AnalyticsPeriod,
  preferDraft = false,
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

  if (preferDraft) {
    return {
      title: draft.title,
      content: draft.content,
      projectionVersion: report.projectionVersion,
      stats: draft.stats,
      expectedRevision: report.revision,
      key: `draft:${report.id}:${report.revision}`,
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
  const text = useAppText();
  const maximum = Math.max(
    1,
    ...activity.map((day) => Math.max(day.journalCount, day.tasksCompleted)),
  );

  return (
    <section
      aria-labelledby="analytics-trend-title"
      className="border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Activity</p>
          <h2 id="analytics-trend-title" className="mt-1 text-sm font-semibold text-foreground">
            {text("每日趋势", "Daily trend")}
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
              role="img"
              aria-label={text(
                `${day.date}：${day.journalCount} 篇日志，${day.tasksCompleted} 个任务完成`,
                `${day.date}: ${day.journalCount} journal${day.journalCount === 1 ? "" : "s"}, ${day.tasksCompleted} task${day.tasksCompleted === 1 ? "" : "s"} completed`,
              )}
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
          {text("日志篇数", "Journals")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 bg-success/70" />
          {text("完成任务", "Tasks completed")}
        </span>
      </div>
    </section>
  );
}

function AnalyticsLoading(): React.JSX.Element {
  const text = useAppText();

  return (
    <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm">
      <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
      {text("正在生成分析", "Generating analytics")}
    </div>
  );
}

export function AnalyticsPage({
  today = currentLocalDate(),
  timezone = localTimezone,
}: AnalyticsPageProps): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const { locale } = useAppMessages();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const reportOpen = searchParams.get("report") === "1";
  const periodType = isPeriodType(params.periodType) ? params.periodType : "week";
  const start = params.start !== undefined && isLocalDate(params.start) ? params.start : today;
  const navigationState = location.state as { readonly analyticsAnchor?: unknown } | null;
  const periodAnchor =
    typeof navigationState?.analyticsAnchor === "string" &&
    isLocalDate(navigationState.analyticsAnchor)
      ? navigationState.analyticsAnchor
      : start;
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
  const [reportDrafts] = useState<ReportDraftStore>(createReportDraftStore);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await services.analytics.getSummary(period));
    } catch {
      setSummary(null);
      setError(
        text(
          "无法读取本地分析数据，请检查存储状态后重试。",
          "Local analytics could not be read. Check storage and try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [period, services.analytics, text]);

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
          const draft =
            reportDrafts.peek(reportPeriodKey(period)) ?? services.analytics.generateDraft(summary);
          setEditorModel(
            reportModel(report, draft, period, reportDrafts.peek(reportPeriodKey(period)) !== null),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEditorModel(null);
          setReportError(text("周期报告加载失败。", "Failed to load the period report."));
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
  }, [period, reportDrafts, reportOpen, services.analytics, summary, text]);

  function navigatePeriod(nextPeriod: AnalyticsPeriod, anchor: string = nextPeriod.start): void {
    navigate(analyticsPath(nextPeriod, reportOpen), {
      state: { analyticsAnchor: anchor },
    });
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
            {text("分析加载失败", "Analytics failed to load")}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setReloadVersion((version) => version + 1)}
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            {text("重试", "Try again")}
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
            <p className="font-mono text-[10px] uppercase text-primary">
              {text("回顾与反思", "Review and reflect")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              {text("分析", "Analytics")}
            </h1>
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              {text(
                `${summary.period.start} 至 ${summary.period.end}`,
                `${summary.period.start} to ${summary.period.end}`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label={text("统计周期", "Reporting period")}
              options={[
                { label: text("周", "Week"), value: "week" },
                { label: text("月", "Month"), value: "month" },
                { label: text("年", "Year"), value: "year" },
              ]}
              value={periodType}
              onChange={(value) => {
                navigatePeriod(resolveAnalyticsPeriod(value, periodAnchor, timezone), periodAnchor);
              }}
            />
            <div className="inline-flex items-center gap-1">
              <IconButton
                label={text("上一周期", "Previous period")}
                onClick={() => navigatePeriod(shiftAnalyticsPeriod(period, -1))}
              >
                <ChevronLeft aria-hidden="true" />
              </IconButton>
              <IconButton
                label={text("下一周期", "Next period")}
                onClick={() => navigatePeriod(shiftAnalyticsPeriod(period, 1))}
              >
                <ChevronRight aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-5">
        <section
          aria-label={text("统计概览", "Analytics overview")}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatTile
            label={text("记录天数", "Recorded days")}
            value={formatNumber(summary.journalDays, locale)}
            detail={text(
              `${formatNumber(summary.journalCount, locale)} 篇日志`,
              `${formatNumber(summary.journalCount, locale)} journals`,
            )}
            icon={BookOpenText}
          />
          <StatTile
            label={text("记录字符", "Characters")}
            value={formatNumber(summary.characterCount, locale)}
            detail={text("按纯文本字符统计", "Counted as plain-text characters")}
            icon={FileText}
          />
          <StatTile
            label={text("完成任务", "Tasks completed")}
            value={formatNumber(summary.tasksCompleted, locale)}
            detail={text("按完成时间归入周期", "Grouped by completion time")}
            icon={CheckSquare2}
          />
          <StatTile
            label={text("知识沉淀", "Knowledge captured")}
            value={formatNumber(summary.knowledgeItems, locale)}
            detail={text(
              `${formatNumber(summary.issuesCreated, locale)} 个问题 · ${formatNumber(summary.solutionsCreated, locale)} 个方案`,
              `${formatNumber(summary.issuesCreated, locale)} issues · ${formatNumber(summary.solutionsCreated, locale)} solutions`,
            )}
            icon={Lightbulb}
          />
        </section>

        {reportOpen ? (
          <>
            {reportLoading ? (
              <div role="status" className="border border-border bg-surface p-6 text-sm">
                {text("正在加载周期报告", "Loading period report")}
              </div>
            ) : reportError === null ? null : (
              <p
                role="alert"
                className="border border-danger/25 bg-danger/5 p-4 text-sm text-danger"
              >
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
                onDraftChange={(draft) => {
                  const key = reportPeriodKey(period);
                  if (draft === null) {
                    reportDrafts.remove(key);
                  } else {
                    reportDrafts.capture(key, draft);
                  }
                }}
              />
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border border-border bg-surface px-4 py-3">
            <Button size="sm" onClick={() => navigate(analyticsPath(period, true))}>
              <FileText aria-hidden="true" className="size-4" />
              {text("打开周期报告", "Open period report")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              title={text("AI 辅助写作：未配置", "AI-assisted writing: not configured")}
              aria-label={text("AI 辅助写作：未配置", "AI-assisted writing: not configured")}
              disabled
            >
              <CircleHelp aria-hidden="true" className="size-4" />
              {text("AI 辅助", "AI assist")}
            </Button>
            <p className="ml-auto text-xs text-muted-foreground">
              {text(
                "报告保存在本地，可随时继续编辑。",
                "Reports are saved locally and can be edited again at any time.",
              )}
            </p>
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
                    {text("活跃标签", "Active tags")}
                  </h2>
                </div>
                <Tags aria-hidden="true" className="size-4 text-primary" />
              </div>
              {summary.activeTags.length === 0 ? (
                <p className="mt-5 text-sm text-muted-foreground">
                  {text("当前周期没有活跃标签。", "No active tags in this period.")}
                </p>
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

            <section
              className="border border-border bg-surface p-4"
              aria-labelledby="task-review-title"
            >
              <h2 id="task-review-title" className="text-sm font-semibold text-foreground">
                {text("任务与沉淀", "Tasks and knowledge")}
              </h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{text("完成任务", "Tasks completed")}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatNumber(summary.tasksCompleted, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{text("新增问题", "New issues")}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatNumber(summary.issuesCreated, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{text("新增解决方案", "New solutions")}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatNumber(summary.solutionsCreated, locale)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>

        {summary.missingDataNotes.length === 0 ? null : (
          <section
            aria-label={text("数据说明", "Data notes")}
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

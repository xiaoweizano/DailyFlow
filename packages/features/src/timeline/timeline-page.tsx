import type { TimelineDaySummary } from "@dailyflow/application";
import type { LocalDate } from "@dailyflow/domain";
import { SegmentedControl } from "@dailyflow/ui";
import { AlertCircle, ArrowRight, CalendarDays, List, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, isLocalDate } from "../date-utils.js";
import { useUserPreferences } from "../preferences/use-user-preferences.js";
import { AnnualHeatmap } from "./annual-heatmap.js";
import { isCalendarMonth, monthDateRange } from "./calendar-utils.js";
import { MonthCalendar } from "./month-calendar.js";

type TimelineView = "calendar" | "timeline" | "heatmap";
const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export interface TimelinePageProps {
  readonly today?: string;
}

export function TimelinePage({ today = currentLocalDate() }: TimelinePageProps): React.JSX.Element {
  const services = useAppServices();
  const { preferences } = useUserPreferences();
  const navigate = useNavigate();
  const initialDate = isLocalDate(today) ? today : currentLocalDate();
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [view, setView] = useState<TimelineView>("calendar");
  const [heatmapYear, setHeatmapYear] = useState(Number(initialDate.slice(0, 4)));
  const [calendarDays, setCalendarDays] = useState<readonly TimelineDaySummary[]>([]);
  const [timelineDays, setTimelineDays] = useState<readonly TimelineDaySummary[]>([]);
  const [annualDays, setAnnualDays] = useState<readonly TimelineDaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [annualLoading, setAnnualLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annualError, setAnnualError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const annualCache = useRef(new Map<string, readonly TimelineDaySummary[]>());

  const loadTimeline = useCallback(async () => {
    if (!isCalendarMonth(month)) {
      setError("月份格式无效");
      setLoading(false);
      return;
    }

    const range = monthDateRange(month);
    if (range === null) {
      setError("月份格式无效");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [calendar, timeline] = await Promise.all([
        services.timeline.getCalendar({
          from: range.from as LocalDate,
          to: range.to as LocalDate,
        }),
        services.timeline.listEntries({
          fromDate: range.from as LocalDate,
          toDate: range.to as LocalDate,
          limit: 50,
        }),
      ]);
      setCalendarDays(calendar);
      setTimelineDays(timeline.items);
    } catch {
      setCalendarDays([]);
      setTimelineDays([]);
      setError("时间线加载失败");
    } finally {
      setLoading(false);
    }
  }, [month, services.timeline]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline, reloadVersion]);

  useEffect(() => {
    if (view !== "heatmap") {
      return;
    }
    const cacheKey = `${heatmapYear}:${LOCAL_TIMEZONE}:${preferences.weekStartsOn}`;
    const cached = annualCache.current.get(cacheKey);
    if (cached !== undefined) {
      setAnnualDays(cached);
      setAnnualLoading(false);
      setAnnualError(null);
      return;
    }

    let active = true;
    setAnnualLoading(true);
    setAnnualError(null);
    void services.timeline
      .getAnnualActivity({ year: heatmapYear, timezone: LOCAL_TIMEZONE })
      .then((days) => {
        if (!active) {
          return;
        }
        annualCache.current.set(cacheKey, days);
        setAnnualDays(days);
      })
      .catch(() => {
        if (active) {
          setAnnualDays([]);
          setAnnualError("年度热力图加载失败");
        }
      })
      .finally(() => {
        if (active) {
          setAnnualLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [heatmapYear, preferences.weekStartsOn, reloadVersion, services.timeline, view]);

  function openDate(date: string): void {
    setSelectedDate(date);
    navigate(`/journal/${date}`);
  }

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Work memory</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">时间线</h1>
          <p className="mt-1 text-sm text-muted-foreground">从日期轨迹回看记录、任务与工作节奏。</p>
        </div>
        <SegmentedControl
          label="时间视图"
          options={[
            { label: "月历", value: "calendar", icon: <CalendarDays aria-hidden="true" /> },
            { label: "时间线", value: "timeline", icon: <List aria-hidden="true" /> },
            { label: "热力图", value: "heatmap", icon: <CalendarDays aria-hidden="true" /> },
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

      <div className="mt-5 border border-border bg-surface p-4 sm:p-5">
        {loading ? (
          <div role="status" className="flex min-h-72 items-center justify-center gap-2 text-sm">
            <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
            正在加载时间线
          </div>
        ) : view === "calendar" ? (
          <MonthCalendar
            month={month}
            selectedDate={selectedDate}
            days={calendarDays}
            onSelectDate={openDate}
            onMonthChange={(nextMonth) => {
              setMonth(nextMonth);
              setSelectedDate(`${nextMonth}-01`);
            }}
          />
        ) : view === "heatmap" ? (
          annualLoading ? (
            <div role="status" className="flex min-h-72 items-center justify-center gap-2 text-sm">
              <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
              正在加载年度热力图
            </div>
          ) : annualError === null ? (
            <AnnualHeatmap
              year={heatmapYear}
              today={today}
              days={annualDays}
              weekStartsOn={preferences.weekStartsOn}
              timezone={LOCAL_TIMEZONE}
              onYearChange={setHeatmapYear}
              onOpenDate={openDate}
            />
          ) : (
            <div role="alert" className="grid min-h-72 place-items-center text-center">
              <div>
                <AlertCircle aria-hidden="true" className="mx-auto size-5 text-danger" />
                <h2 className="mt-3 text-base font-semibold text-foreground">{annualError}</h2>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  onClick={() => setReloadVersion((version) => version + 1)}
                >
                  <RotateCw aria-hidden="true" className="size-3.5" />
                  重试
                </button>
              </div>
            </div>
          )
        ) : timelineDays.length === 0 ? (
          <div className="grid min-h-72 place-items-center text-center">
            <div>
              <List aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <h2 className="mt-3 text-base font-semibold text-foreground">还没有时间线记录</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                持续记录后，最近的日期会出现在这里。
              </p>
            </div>
          </div>
        ) : (
          <section aria-labelledby="timeline-list-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Recent flow</p>
                <h2 id="timeline-list-title" className="mt-1 text-xl font-semibold text-foreground">
                  最近记录
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">{timelineDays.length} 天</span>
            </div>
            <ol className="mt-5 border-l border-border">
              {timelineDays.map((entry) => (
                <li key={entry.date} className="relative pb-6 pl-6 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute -left-1 top-1.5 size-2 rounded-full border-2 border-surface bg-primary"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <time
                      dateTime={entry.date}
                      className="font-mono text-[11px] text-muted-foreground"
                    >
                      {entry.date}
                    </time>
                    {entry.journalCount ? (
                      <span className="rounded-[3px] border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary">
                        {entry.journalCount} 篇日志
                      </span>
                    ) : null}
                    {entry.taskDueCount ? (
                      <span className="rounded-[3px] border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[10px] text-foreground">
                        {entry.taskDueCount} 个任务到期
                      </span>
                    ) : null}
                  </div>
                  <Link
                    to={`/journal/${entry.date}`}
                    aria-label={`${entry.title || "无标题日志"} ${entry.date}`}
                    className="mt-2 block max-w-3xl text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {entry.title || "无标题日志"}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {entry.excerpt || "这一天还没有摘要。"}
                  </p>
                </li>
              ))}
            </ol>
            <Link
              to={`/journal/${selectedDate}`}
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              打开 {selectedDate} 日志
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

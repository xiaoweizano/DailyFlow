import type { JournalLookup } from "@dailyflow/application";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button, Input } from "@dailyflow/ui";

import { useAppServices } from "../app-services-hooks.js";
import { currentLocalDate, isLocalDate, shiftLocalDate } from "../date-utils.js";
import { JournalEditor } from "./journal-editor.js";

function resolveTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const localTimezone = resolveTimezone();

export interface JournalPageProps {
  readonly date?: string;
}

export function JournalPage({ date }: JournalPageProps): React.JSX.Element {
  const services = useAppServices();
  const navigate = useNavigate();
  const params = useParams();
  const journalDate = date ?? params.date ?? "";
  const [lookup, setLookup] = useState<JournalLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [dateDraft, setDateDraft] = useState(() => (isLocalDate(journalDate) ? journalDate : ""));

  useEffect(() => {
    setDateDraft(isLocalDate(journalDate) ? journalDate : "");
  }, [journalDate]);

  const loadJournal = useCallback(async () => {
    if (!journalDate) {
      setError("日志日期无效");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await services.journal.get({
        journalDate,
        timezone: localTimezone,
      });
      if (!result.ok) {
        setError(result.error.code === "VALIDATION_ERROR" ? "日志日期无效" : "日志加载失败");
        setLookup(null);
        return;
      }
      setLookup(result.value);
    } catch {
      setError("日志加载失败");
      setLookup(null);
    } finally {
      setLoading(false);
    }
  }, [journalDate, services.journal]);

  useEffect(() => {
    void loadJournal();
  }, [loadJournal, reloadVersion]);

  function handleRestored(): void {
    setReloadVersion((version) => version + 1);
  }

  function openDate(nextDate: string): void {
    if (isLocalDate(nextDate)) {
      navigate(`/journal/${nextDate}`);
    }
  }

  function handleDateChange(nextDate: string): void {
    setDateDraft(nextDate);
    openDate(nextDate);
  }

  const navigationDate = isLocalDate(journalDate) ? journalDate : currentLocalDate();

  return (
    <div className="flex min-h-full flex-col">
      <h1 className="sr-only">每日日志 {journalDate}</h1>
      <nav
        aria-label="日志日期导航"
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-3 py-2"
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="前一天"
          onClick={() => openDate(shiftLocalDate(navigationDate, -1))}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">前一天</span>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <label htmlFor="journal-date" className="sr-only">
            选择日志日期
          </label>
          <Input
            id="journal-date"
            aria-label="选择日志日期"
            type="text"
            inputMode="numeric"
            pattern="\d{4}-\d{2}-\d{2}"
            placeholder="YYYY-MM-DD"
            value={dateDraft}
            className="h-8 w-36 bg-surface font-mono text-xs"
            onChange={(event) => handleDateChange(event.currentTarget.value)}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="后一天"
          onClick={() => openDate(shiftLocalDate(navigationDate, 1))}
        >
          <span className="hidden sm:inline">后一天</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <Link
          to="/"
          className="ml-auto inline-flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          返回今天
        </Link>
      </nav>

      {loading ? (
        <div
          role="status"
          className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <RotateCw aria-hidden="true" className="size-4 animate-spin" />
          正在加载日志
        </div>
      ) : error !== null || lookup === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div role="alert" className="w-full max-w-md border border-danger/25 bg-danger/5 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-foreground">无法打开日志</h1>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {error ?? "日志数据不可用"}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    void loadJournal();
                  }}
                >
                  <RotateCw aria-hidden="true" className="size-3.5" />
                  重试
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-4 py-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{lookup.journal.timezone}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">
              {lookup.isPersisted ? "本地日志" : "新日志，首次编辑后保存"}
            </span>
            <span className="ml-auto shrink-0 font-mono">
              {lookup.isPersisted ? `r${lookup.journal.revision}` : "未保存"}
            </span>
          </header>
          <div className="min-h-0 flex-1">
            <JournalEditor
              key={`${lookup.journal.id}:${lookup.journal.revision}:${reloadVersion}`}
              lookup={lookup}
              onRestored={handleRestored}
            />
          </div>
        </>
      )}
    </div>
  );
}

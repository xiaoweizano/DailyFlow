import type { JournalLookup } from "@dailyflow/application";
import { AlertCircle, CalendarDays, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Button } from "@dailyflow/ui";

import { useAppServices } from "../app-services-hooks.js";
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
  const params = useParams();
  const journalDate = date ?? params.date ?? "";
  const [lookup, setLookup] = useState<JournalLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

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

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-full items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <RotateCw aria-hidden="true" className="size-4 animate-spin" />
        正在加载日志
      </div>
    );
  }

  if (error !== null || lookup === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
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
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-4 py-2 text-xs text-muted-foreground">
        <CalendarDays aria-hidden="true" className="size-4 text-primary" />
        <time dateTime={lookup.journal.journalDate}>{lookup.journal.journalDate}</time>
        <span aria-hidden="true">·</span>
        <span className="truncate">{lookup.journal.timezone}</span>
        <span className="ml-auto shrink-0 font-mono">
          {lookup.isPersisted ? `r${lookup.journal.revision}` : "新日志"}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <JournalEditor
          key={`${lookup.journal.id}:${lookup.journal.revision}:${reloadVersion}`}
          lookup={lookup}
          onRestored={handleRestored}
        />
      </div>
    </div>
  );
}

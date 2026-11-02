import type { JournalLookup } from "@dailyflow/application";
import { SaveStatus, type SaveState } from "@dailyflow/ui";
import { ArrowRight, BookOpenText, FileUp } from "lucide-react";
import { Link } from "react-router-dom";

export interface TodayJournalPanelProps {
  readonly lookup: JournalLookup;
  readonly status?: SaveState;
  readonly onRetry?: () => void;
}

export function TodayJournalPanel({
  lookup,
  status = "idle",
  onRetry,
}: TodayJournalPanelProps): React.JSX.Element {
  const { journal, isPersisted } = lookup;
  const journalPath = `/journal/${journal.journalDate}`;
  const excerpt = journal.excerpt || journal.contentPlainText;

  if (!isPersisted) {
    return (
      <section aria-labelledby="today-journal-title" className="border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-border bg-surface-muted text-primary">
            <BookOpenText aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Today</p>
            <h2 id="today-journal-title" className="mt-1 text-lg font-semibold text-foreground">
              今天还没有记录
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              从一段简短的记录开始，把今天的工作、问题和解决过程留在本地。
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={journalPath}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-primary bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
          >
            创建第一篇日志
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link
            to="/data?tab=import"
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3.5 text-sm font-medium text-foreground shadow-sm hover:border-primary/45 hover:bg-surface-muted"
          >
            <FileUp aria-hidden="true" className="size-4" />
            导入历史 TXT
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="today-journal-title" className="border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpenText aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Today</p>
          <time dateTime={journal.journalDate} className="text-xs text-muted-foreground">
            {journal.journalDate}
          </time>
        </div>
        <SaveStatus status={status} />
      </div>
      <h2
        id="today-journal-title"
        className="mt-4 text-xl font-semibold leading-7 text-foreground"
      >
        {journal.title.trim() || "今天的日志"}
      </h2>
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {excerpt || "今天的日志还没有正文。"}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Link
          to={journalPath}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          继续记录今天
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        {status === "error" && onRetry !== undefined ? (
          <button
            type="button"
            className="text-xs font-medium text-danger hover:underline"
            onClick={onRetry}
          >
            重试保存
          </button>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          r{journal.revision}
        </span>
      </div>
    </section>
  );
}

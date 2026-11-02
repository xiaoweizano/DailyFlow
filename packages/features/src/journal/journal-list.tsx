import type { JournalSummary } from "@dailyflow/application";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export interface JournalListProps {
  readonly summaries: readonly JournalSummary[];
}

export function JournalList({ summaries }: JournalListProps): React.JSX.Element {
  return (
    <section aria-labelledby="recent-journals-title" className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Recent notes</p>
          <h2 id="recent-journals-title" className="mt-1 text-base font-semibold text-foreground">
            最近记录
          </h2>
        </div>
      </div>

      {summaries.length === 0 ? (
        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          最近还没有日志记录
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {summaries.map((summary) => (
            <li key={`${summary.journalDate}:${summary.id}`}>
              <Link
                to={`/journal/${summary.journalDate}`}
                className="group flex min-w-0 items-start gap-3 py-3 text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <time
                  dateTime={summary.journalDate}
                  className="w-20 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {summary.journalDate}
                </time>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {summary.title.trim() || "无标题日志"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {summary.excerpt || "暂无摘要"}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

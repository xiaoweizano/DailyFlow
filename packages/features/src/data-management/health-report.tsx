import type { DataHealthIssue, DataHealthReport } from "@dailyflow/application";
import { AlertTriangle, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";

import { useOptionalAppMessages } from "../preferences/use-app-messages.js";
import { useAppText, type AppText } from "../preferences/use-app-text.js";

const statusClassName: Readonly<Record<DataHealthReport["status"], string>> = {
  healthy: "border-success/25 bg-success/5 text-success",
  attention: "border-warning/30 bg-warning/5 text-warning",
  critical: "border-danger/30 bg-danger/5 text-danger",
};

function statusLabel(status: DataHealthReport["status"], text: AppText): string {
  switch (status) {
    case "healthy":
      return text("数据状态正常", "Data is healthy");
    case "attention":
      return text("需要关注", "Needs attention");
    case "critical":
      return text("需要处理", "Action required");
  }
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function englishIssueCopy(
  issue: DataHealthIssue,
): Pick<DataHealthIssue, "title" | "detail" | "recommendation"> {
  switch (issue.code) {
    case "integrity_check_failed":
      return {
        title: "Database integrity check failed",
        detail: "The local database did not pass its integrity check.",
        recommendation: "Create a usable backup first, then use the supported restore workflow.",
      };
    case "foreign_key_violations":
      return {
        title: "Invalid data relationships",
        detail: `${issue.count} relationships violate foreign-key constraints.`,
        recommendation: "Restore a verified backup and retain the current data for diagnosis.",
      };
    case "duplicate_journal_dates":
      return {
        title: "Duplicate journal dates",
        detail: `${issue.count} dates have more than one active journal.`,
        recommendation:
          "Restore a backup or export the raw records before resolving date conflicts.",
      };
    case "orphaned_attachments":
      return {
        title: "Orphaned attachments",
        detail: `${issue.count} attachments are not referenced by a journal or knowledge item.`,
        recommendation:
          "Check the attachment source, relink it if needed, and remove it only after confirmation.",
      };
    case "invalid_attachment_links":
      return {
        title: "Invalid attachment links",
        detail: `${issue.count} attachment references point to missing attachments or content.`,
        recommendation: "Restore a backup and export an archive that includes attachments.",
      };
    case "invalid_task_relations":
      return {
        title: "Invalid task relationships",
        detail: `${issue.count} tasks point to source records that no longer exist.`,
        recommendation:
          "Restore a backup or export task data before repairing source relationships.",
      };
    case "stale_search_projections":
      return {
        title: "Search projections need rebuilding",
        detail: `${issue.count} search documents are out of date.`,
        recommendation:
          "Run Inspect and rebuild index to regenerate search data from authoritative content.",
      };
    case "stale_search_index_versions":
      return {
        title: "Search index versions are outdated",
        detail: `${issue.count} search documents use an older index version.`,
        recommendation: "Run Inspect and rebuild index to upgrade the search index.",
      };
    case "search_document_count_mismatch":
      return {
        title: "Search document count mismatch",
        detail: "The search index and authoritative content contain different document counts.",
        recommendation: "Run Inspect and rebuild index to reconcile the search index.",
      };
    case "search_index_failed":
      return {
        title: "Search index needs attention",
        detail: "The search index reported an error.",
        recommendation: "Run Inspect and rebuild index and review the result.",
      };
    case "backup_not_observed":
      return {
        title: "No verified backup recorded",
        detail: "DailyFlow has not recorded a verified backup for this data.",
        recommendation: "Create a backup from Backup and restore.",
      };
  }
}

function IssueCard({ issue }: { readonly issue: DataHealthIssue }): React.JSX.Element {
  const locale = useOptionalAppMessages()?.locale ?? "zh-CN";
  const copy = locale === "en-US" ? englishIssueCopy(issue) : issue;
  const critical = issue.severity === "critical";
  const Icon = critical ? AlertTriangle : CircleAlert;
  return (
    <article
      className={`border p-3 ${
        critical ? "border-danger/25 bg-danger/5" : "border-warning/25 bg-warning/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className={`mt-0.5 size-4 shrink-0 ${critical ? "text-danger" : "text-warning"}`}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              {new Intl.NumberFormat(locale).format(issue.count)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.detail}</p>
          <p className="mt-2 border-l-2 border-current pl-2 text-xs leading-5 text-foreground/75">
            {copy.recommendation}
          </p>
        </div>
      </div>
    </article>
  );
}

export interface HealthReportProps {
  readonly report: DataHealthReport;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}

export function HealthReport({
  report,
  refreshing,
  onRefresh,
}: HealthReportProps): React.JSX.Element {
  const text = useAppText();
  const locale = useOptionalAppMessages()?.locale ?? "zh-CN";
  return (
    <section aria-labelledby="health-report-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Integrity review</p>
          <h2 id="health-report-title" className="mt-1 text-lg font-semibold text-foreground">
            {text("数据健康检查", "Data health")}
          </h2>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          className="inline-flex h-8 items-center gap-1.5 border border-border-strong bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-55"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? text("正在检查", "Checking") : text("重新检查", "Check again")}
        </button>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-3 border px-4 py-3 ${
          statusClassName[report.status]
        }`}
      >
        <div className="flex items-center gap-2.5">
          {report.status === "healthy" ? (
            <ShieldCheck aria-hidden="true" className="size-5" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-5" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {statusLabel(report.status, text)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {text("检查时间", "Checked")} {formatDateTime(report.checkedAt, locale)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>
            {text("完整性", "Integrity")} {report.facts.integrity}
          </span>
          <span>
            {text("外键异常", "Foreign-key issues")} {report.facts.foreignKeyViolationCount}
          </span>
          <span>
            {text("索引", "Indexed")} {report.facts.indexedDocumentCount}/
            {report.facts.authoritativeDocumentCount}
          </span>
        </div>
      </div>

      {report.issues.length === 0 ? (
        <div className="flex items-center gap-3 border border-success/25 bg-success/5 px-4 py-4">
          <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
          <p className="text-sm text-foreground">
            {text("未发现需要处理的数据问题。", "No data issues require attention.")}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {report.issues.map((issue) => (
            <IssueCard key={issue.code} issue={issue} />
          ))}
        </div>
      )}
    </section>
  );
}

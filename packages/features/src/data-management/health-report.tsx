import type { DataHealthIssue, DataHealthReport } from "@dailyflow/application";
import { AlertTriangle, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";

const statusCopy: Readonly<
  Record<DataHealthReport["status"], { readonly label: string; readonly className: string }>
> = {
  healthy: {
    label: "数据状态正常",
    className: "border-success/25 bg-success/5 text-success",
  },
  attention: {
    label: "需要关注",
    className: "border-warning/30 bg-warning/5 text-warning",
  },
  critical: {
    label: "需要处理",
    className: "border-danger/30 bg-danger/5 text-danger",
  },
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function IssueCard({ issue }: { readonly issue: DataHealthIssue }): React.JSX.Element {
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
            <h3 className="text-sm font-semibold text-foreground">{issue.title}</h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              {new Intl.NumberFormat("zh-CN").format(issue.count)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{issue.detail}</p>
          <p className="mt-2 border-l-2 border-current pl-2 text-xs leading-5 text-foreground/75">
            {issue.recommendation}
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
  const status = statusCopy[report.status];
  return (
    <section aria-labelledby="health-report-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Integrity review</p>
          <h2 id="health-report-title" className="mt-1 text-lg font-semibold text-foreground">
            数据健康检查
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
          {refreshing ? "正在检查" : "重新检查"}
        </button>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-3 border px-4 py-3 ${status.className}`}
      >
        <div className="flex items-center gap-2.5">
          {report.status === "healthy" ? (
            <ShieldCheck aria-hidden="true" className="size-5" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-5" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">{status.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              检查时间 {formatDateTime(report.checkedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>完整性 {report.facts.integrity}</span>
          <span>外键异常 {report.facts.foreignKeyViolationCount}</span>
          <span>
            索引 {report.facts.indexedDocumentCount}/{report.facts.authoritativeDocumentCount}
          </span>
        </div>
      </div>

      {report.issues.length === 0 ? (
        <div className="flex items-center gap-3 border border-success/25 bg-success/5 px-4 py-4">
          <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
          <p className="text-sm text-foreground">未发现需要处理的数据问题。</p>
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

import type { DataHealthReport } from "@dailyflow/application";
import {
  ArrowRight,
  DatabaseBackup,
  Download,
  LoaderCircle,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { useAppText } from "../preferences/use-app-text.js";
import { HealthReport } from "./health-report.js";
import { IndexMaintenance } from "./index-maintenance.js";
import { StorageOverview } from "./storage-overview.js";

export function DataManagementPage(): React.JSX.Element {
  const { dataManagement } = useAppServices();
  const text = useAppText();
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const managementLinks = [
    {
      to: "/data/import",
      title: text("导入 TXT", "Import TXT"),
      description: text(
        "批量迁移按月份组织的每日文本日志。",
        "Batch migrate daily text journals organized by month.",
      ),
      icon: Upload,
    },
    {
      to: "/data/export",
      title: text("导出归档", "Export archive"),
      description: text(
        "从权威内容生成 Markdown 与 NDJSON。",
        "Generate Markdown and NDJSON from authoritative content.",
      ),
      icon: Download,
    },
    {
      to: "/data/backup",
      title: text("备份与恢复", "Backup and restore"),
      description: text(
        "创建可校验归档，或从已验证备份恢复。",
        "Create a verifiable archive or restore from a verified backup.",
      ),
      icon: DatabaseBackup,
    },
  ] as const;

  useEffect(() => {
    let active = true;
    if (dataManagement === undefined) {
      setLoading(false);
      setError(text("数据管理服务尚未接入。", "Data management is not available."));
      return () => {
        active = false;
      };
    }
    if (report === null) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    void dataManagement
      .inspect()
      .then((next) => {
        if (active) {
          setReport(next);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : text("无法读取本地数据状态。", "Unable to read local data status."),
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [dataManagement, revision, text]);

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-primary">
              Data Management / Local first
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              {text("数据管理", "Data management")}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {text(
                "检查本地数据完整性，维护搜索投影，并统一进入导入、导出、备份与恢复流程。 健康检查只报告问题，不自动删除正文或附件。",
                "Inspect local data integrity, maintain search projections, and manage import, export, backup, and restore in one place. Health checks report issues without deleting journals or attachments.",
              )}
            </p>
          </div>
          <span className="border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
            V1 · LOCAL ONLY
          </span>
        </div>
      </header>

      <div className="mt-5 grid gap-5">
        <section aria-labelledby="data-entry-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase text-primary">Migration & safety</p>
              <h2 id="data-entry-title" className="mt-1 text-lg font-semibold text-foreground">
                {text("数据流程", "Data workflows")}
              </h2>
            </div>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              {text("所有操作均在当前设备完成", "All operations run on this device")}
            </p>
          </div>
          <div className="mt-3 grid border-l border-t border-border md:grid-cols-3">
            {managementLinks.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.to}
                  to={entry.to}
                  className="group relative flex min-h-32 flex-col justify-between border-b border-r border-border bg-surface p-4 transition-colors hover:bg-surface-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-8 place-items-center border border-border bg-surface-muted/50 text-primary">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      0{index + 1}
                    </span>
                  </div>
                  <div className="mt-5">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {entry.title}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                    <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                      {entry.description}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {loading ? (
          <div
            role="status"
            className="grid min-h-44 place-items-center border border-border bg-surface"
          >
            <div className="text-center">
              <LoaderCircle
                aria-hidden="true"
                className="mx-auto size-5 animate-spin text-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {text("正在检查本地数据", "Inspecting local data")}
              </p>
            </div>
          </div>
        ) : null}

        {error === null ? null : (
          <div role="alert" className="border border-danger/25 bg-danger/5 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {text("无法完成数据健康检查", "Data health check failed")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => setRevision((value) => value + 1)}
              className="mt-3 inline-flex h-8 items-center gap-1.5 border border-border-strong bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-surface-muted"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              {text("重试检查", "Retry check")}
            </button>
          </div>
        )}

        {report === null ? null : (
          <>
            <StorageOverview storage={report.storage} />
            <HealthReport
              report={report}
              refreshing={refreshing}
              onRefresh={() => setRevision((value) => value + 1)}
            />
            {dataManagement === undefined ? null : (
              <IndexMaintenance
                services={dataManagement}
                onCompleted={() => setRevision((value) => value + 1)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

import type { DataStorageSummary } from "@dailyflow/application";
import {
  Archive,
  BookOpenText,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  HardDrive,
  ListTodo,
  Paperclip,
  Search,
} from "lucide-react";

import { useOptionalAppMessages } from "../preferences/use-app-messages.js";
import { useAppText } from "../preferences/use-app-text.js";

function formatByteCount(bytes: number, locale: string): string {
  if (bytes < 1024) {
    return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value)} ${units[unitIndex]}`;
}

function formatDateTime(value: string | null, locale: string, emptyLabel: string): string {
  if (value === null) {
    return emptyLabel;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export interface StorageOverviewProps {
  readonly storage: DataStorageSummary;
}

export function StorageOverview({ storage }: StorageOverviewProps): React.JSX.Element {
  const text = useAppText();
  const locale = useOptionalAppMessages()?.locale ?? "zh-CN";
  const countItems = [
    { key: "journalCount", label: text("日志", "Journals"), icon: FileText },
    { key: "knowledgeItemCount", label: text("知识", "Knowledge"), icon: BookOpenText },
    { key: "taskCount", label: text("待办", "Tasks"), icon: ListTodo },
    { key: "attachmentCount", label: text("附件", "Attachments"), icon: Paperclip },
    { key: "searchDocumentCount", label: text("搜索文档", "Search documents"), icon: Search },
  ] as const;
  const quotaPercent =
    storage.quotaBytes === null || storage.quotaBytes === 0
      ? null
      : Math.min(100, Math.max(0, (storage.usageBytes / storage.quotaBytes) * 100));

  return (
    <section aria-labelledby="storage-overview-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Local storage</p>
          <h2 id="storage-overview-title" className="mt-1 text-lg font-semibold text-foreground">
            {text("本地存储概览", "Local storage")}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
          <CheckCircle2 aria-hidden="true" className="size-3.5" />
          {text("数据仅保存在当前设备", "Data stays on this device")}
        </span>
      </div>

      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div className="bg-surface p-4 sm:col-span-2 xl:col-span-1">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center border border-primary/25 bg-primary/5 text-primary">
              <Database aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase text-muted-foreground">
                {text("逻辑位置", "Logical location")}
              </p>
              <p className="mt-1 break-words text-sm font-medium text-foreground">
                {storage.locationLabel}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                Schema v{storage.schemaVersion} · {storage.storageKind}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-surface p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive aria-hidden="true" className="size-3.5" />
            <p className="text-[10px] uppercase">{text("已用空间", "Used space")}</p>
          </div>
          <p className="mt-3 font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatByteCount(storage.usageBytes, locale)}
          </p>
          {storage.quotaBytes === null ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {text("无可用配额估算", "No quota estimate available")}
            </p>
          ) : (
            <>
              <div className="mt-2 h-1 overflow-hidden bg-surface-muted" aria-hidden="true">
                <div className="h-full bg-primary" style={{ width: `${quotaPercent ?? 0}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {text(
                  `共 ${formatByteCount(storage.quotaBytes, locale)}`,
                  `of ${formatByteCount(storage.quotaBytes, locale)}`,
                )}
              </p>
            </>
          )}
        </div>

        <div className="bg-surface p-4">
          <p className="text-[10px] uppercase text-muted-foreground">
            {text("浏览数据持久化", "Browser persistence")}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
            {storage.persisted ? (
              <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-4 text-warning" />
            )}
            {storage.persisted
              ? text("已授权持久化", "Persistence granted")
              : text("浏览器管理", "Managed by browser")}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            {storage.persisted
              ? text("存储空间由当前浏览器保留。", "Storage is retained by this browser.")
              : text(
                  "清理站点数据可能移除本地内容。",
                  "Clearing site data may remove local content.",
                )}
          </p>
        </div>

        <div className="bg-surface p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Archive aria-hidden="true" className="size-3.5" />
            <p className="text-[10px] uppercase">{text("最近备份", "Last backup")}</p>
          </div>
          <p className="mt-3 text-xs font-medium text-foreground">
            {formatDateTime(storage.lastBackupAt, locale, text("尚未记录", "Not recorded yet"))}
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {text("原始导入", "Raw imports")} {formatByteCount(storage.rawImportByteCount, locale)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 lg:grid-cols-5">
        {countItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="border-b border-r border-border bg-surface px-3 py-3">
              <dt className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Icon aria-hidden="true" className="size-3" />
                {item.label}
              </dt>
              <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                {new Intl.NumberFormat(locale).format(storage[item.key])}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

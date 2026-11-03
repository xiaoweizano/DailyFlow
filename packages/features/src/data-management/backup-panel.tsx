import type {
  BackupRestoreResult,
  BackupSourceFile,
  CreateBackupOutcome,
  InspectedBackup,
} from "@dailyflow/application";
import { Button } from "@dailyflow/ui";
import {
  AlertCircle,
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  DatabaseBackup,
  FileArchive,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useState } from "react";

import { useAppServices } from "../app-services-hooks.js";

const entityLabels: Readonly<Record<string, string>> = {
  journals: "日志",
  journalVersions: "历史版本",
  structuredBlocks: "结构化块",
  knowledgeItems: "知识条目",
  knowledgeLinks: "知识关联",
  tasks: "待办",
  tags: "标签",
  reports: "报告",
  importSessions: "导入会话",
  importEntries: "导入条目",
};

function formatByteCount(bytes: number): string {
  if (bytes < 1024) {
    return `${new Intl.NumberFormat("zh-CN").format(bytes)} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
  }).format(value)} ${units[unitIndex]}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function SavedBackup({ outcome }: { readonly outcome: CreateBackupOutcome }): React.JSX.Element {
  if (outcome.status === "cancelled") {
    return (
      <div
        role="status"
        aria-label="备份保存已取消"
        className="flex items-start gap-3 border border-warning/30 bg-warning/5 px-4 py-3"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">备份保存已取消</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            未写入文件，当前数据没有变化。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-success/25 bg-success/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">备份已保存</h2>
          <p className="mt-1 break-all font-mono text-[11px] leading-5 text-foreground">
            {outcome.saved.filename}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            已写入 {formatByteCount(outcome.saved.bytesWritten)}，归档共{" "}
            {outcome.artifact.files.length} 个文件。
          </p>
        </div>
      </div>
    </div>
  );
}

function BackupCounts({ backup }: { readonly backup: InspectedBackup }): React.JSX.Element {
  const counts = Object.entries(backup.manifest.entityCounts).filter(([, count]) => count > 0);
  return (
    <dl className="grid grid-cols-2 border-l border-t border-border sm:grid-cols-3 lg:grid-cols-5">
      {counts.map(([entity, count]) => (
        <div key={entity} className="min-w-0 border-b border-r border-border px-3 py-3">
          <dt className="truncate text-[10px] text-muted-foreground">
            {entityLabels[entity] ?? entity}
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
            {new Intl.NumberFormat("zh-CN").format(count)}
          </dd>
        </div>
      ))}
      <div className="min-w-0 border-b border-r border-border px-3 py-3">
        <dt className="text-[10px] text-muted-foreground">附件</dt>
        <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
          {new Intl.NumberFormat("zh-CN").format(backup.manifest.attachmentCount)}
        </dd>
      </div>
      <div className="min-w-0 border-b border-r border-border px-3 py-3">
        <dt className="text-[10px] text-muted-foreground">原始导入文件</dt>
        <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
          {new Intl.NumberFormat("zh-CN").format(backup.manifest.rawImportFileCount)}
        </dd>
      </div>
    </dl>
  );
}

function InspectionSummary({
  file,
  backup,
}: {
  readonly file: BackupSourceFile;
  readonly backup: InspectedBackup;
}): React.JSX.Element {
  return (
    <section aria-labelledby="backup-inspection-title" className="grid gap-3">
      <div className="border border-success/25 bg-success/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="min-w-0">
            <h2 id="backup-inspection-title" className="text-sm font-semibold text-foreground">
              备份校验通过
            </h2>
            <p className="mt-1 break-all font-mono text-[11px] leading-5 text-foreground">
              {file.filename}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              格式版本 {backup.manifest.formatVersion}，数据 Schema{" "}
              {backup.manifest.dataSchemaVersion}，应用版本 {backup.manifest.appVersion}
            </p>
          </div>
        </div>
      </div>

      <BackupCounts backup={backup} />

      <dl className="grid gap-3 border border-border bg-surface px-4 py-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">创建时间</dt>
          <dd className="mt-1 text-foreground">{formatDateTime(backup.manifest.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">归档大小</dt>
          <dd className="mt-1 font-mono tabular-nums text-foreground">
            {formatByteCount(backup.manifest.totalBytes)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">内容摘要</dt>
          <dd
            className="mt-1 truncate font-mono text-foreground"
            title={backup.manifest.contentDigest}
          >
            {backup.manifest.contentDigest.slice(0, 16)}...
          </dd>
        </div>
      </dl>
    </section>
  );
}

function RestoreResultPanel({
  result,
}: {
  readonly result: BackupRestoreResult;
}): React.JSX.Element {
  return (
    <div className="border border-success/25 bg-success/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">恢复完成</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            数据已在单一事务内切换，搜索索引已标记为待重建。
          </p>
          {result.safetySnapshot === undefined ? null : (
            <p className="mt-2 break-all border border-border bg-surface px-3 py-2 font-mono text-[11px] text-foreground">
              安全快照：{result.safetySnapshot.fileName}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function BackupPanel(): React.JSX.Element {
  const { backups } = useAppServices();
  const [creating, setCreating] = useState(false);
  const [createOutcome, setCreateOutcome] = useState<CreateBackupOutcome | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectionCancelled, setSelectionCancelled] = useState(false);
  const [selectedFile, setSelectedFile] = useState<BackupSourceFile | null>(null);
  const [inspection, setInspection] = useState<InspectedBackup | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<BackupRestoreResult | null>(null);

  async function createBackup(): Promise<void> {
    setCreating(true);
    setCreateOutcome(null);
    setCreateError(null);
    try {
      setCreateOutcome(await backups.create());
    } catch (error) {
      setCreateError(errorMessage(error, "创建备份失败，请重试。"));
    } finally {
      setCreating(false);
    }
  }

  async function selectBackup(): Promise<void> {
    setSelecting(true);
    setSelectionCancelled(false);
    setSelectedFile(null);
    setInspection(null);
    setInspectError(null);
    setConfirmed(false);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const file = await backups.selectSource();
      if (file === null) {
        setSelectionCancelled(true);
        return;
      }
      setSelectedFile(file);
      try {
        setInspection(await backups.inspect(file));
      } catch (error) {
        setInspectError(errorMessage(error, "无法校验备份文件，请重新选择。"));
      }
    } catch (error) {
      setInspectError(errorMessage(error, "无法读取备份文件，请重试。"));
    } finally {
      setSelecting(false);
    }
  }

  async function restore(): Promise<void> {
    if (selectedFile === null || inspection === null || !confirmed) {
      return;
    }
    setRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      setRestoreResult(await backups.restore(selectedFile, inspection.manifest.contentDigest));
    } catch (error) {
      setRestoreError(errorMessage(error, "恢复失败，当前数据没有被替换。"));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section aria-labelledby="backup-panel-title" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Verified recovery</p>
          <h2 id="backup-panel-title" className="mt-1 text-lg font-semibold text-foreground">
            完整备份与恢复
          </h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          ZIP 使用内容哈希与严格路径校验；恢复失败会丢弃 staging，并保持当前数据库不变。
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section
          aria-labelledby="create-backup-title"
          className="border border-border bg-surface p-4"
        >
          <div className="flex items-start gap-3">
            <DatabaseBackup aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h3 id="create-backup-title" className="text-sm font-semibold text-foreground">
                创建完整备份
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                包含全部业务表、历史版本、附件和可用的 TXT 原始字节。
              </p>
            </div>
          </div>
          <Button className="mt-4" disabled={creating} onClick={() => void createBackup()}>
            {creating ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <FileArchive aria-hidden="true" className="size-4" />
            )}
            {creating ? "正在创建备份" : "创建完整备份"}
          </Button>
          {createError === null ? null : (
            <div role="alert" className="mt-3 border border-danger/25 bg-danger/5 px-3 py-3">
              <p className="text-xs text-danger">{createError}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => void createBackup()}
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                重试创建
              </Button>
            </div>
          )}
          {createOutcome === null ? null : (
            <div className="mt-3">
              <SavedBackup outcome={createOutcome} />
            </div>
          )}
        </section>

        <section
          aria-labelledby="restore-backup-title"
          className="border border-border bg-surface p-4"
        >
          <div className="flex items-start gap-3">
            <ArchiveRestore aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <h3 id="restore-backup-title" className="text-sm font-semibold text-foreground">
                从备份恢复
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                先解包和校验全部内容，再替换当前本地数据。
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            className="mt-4"
            disabled={selecting || restoring}
            onClick={() => void selectBackup()}
          >
            {selecting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="size-4" />
            )}
            {selecting ? "正在校验备份" : "选择备份文件"}
          </Button>
          {selectionCancelled ? (
            <div
              role="status"
              aria-label="已取消选择备份"
              className="mt-3 flex items-start gap-2 border border-warning/30 bg-warning/5 px-3 py-3"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-xs text-foreground">已取消选择备份，当前数据没有变化。</p>
            </div>
          ) : null}
          {inspectError === null ? null : (
            <p
              role="alert"
              className="mt-3 border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger"
            >
              {inspectError}
            </p>
          )}
        </section>
      </div>

      {selectedFile === null || inspection === null ? null : (
        <section aria-labelledby="restore-confirmation-title" className="grid gap-4">
          <InspectionSummary file={selectedFile} backup={inspection} />

          <div className="border border-warning/35 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <h2
                  id="restore-confirmation-title"
                  className="text-sm font-semibold text-foreground"
                >
                  替换当前数据
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  当前数据非空时会先创建安全快照。恢复完成后，搜索索引需要显式重建。
                </p>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 border border-warning/25 bg-surface px-3 py-3">
              <input
                type="checkbox"
                aria-label="我已确认将用此备份替换当前本地数据"
                checked={confirmed}
                disabled={restoring}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="text-xs leading-5 text-foreground">
                我已确认将用此备份替换当前本地数据。
              </span>
            </label>
            <Button
              variant="secondary"
              className="mt-3"
              disabled={!confirmed || restoring}
              onClick={() => void restore()}
            >
              {restoring ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <LockKeyhole aria-hidden="true" className="size-4" />
              )}
              {restoring
                ? "正在恢复数据"
                : restoreError === null
                  ? "确认恢复并替换当前数据"
                  : "重试恢复"}
            </Button>
          </div>

          {restoreError === null ? null : (
            <div role="alert" className="border border-danger/25 bg-danger/5 px-4 py-3">
              <p className="text-sm font-medium text-foreground">恢复失败，当前数据未替换</p>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {restoreError}
              </p>
            </div>
          )}
          {restoreResult === null ? null : <RestoreResultPanel result={restoreResult} />}
        </section>
      )}
    </section>
  );
}

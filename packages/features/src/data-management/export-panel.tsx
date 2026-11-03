import type {
  ExportDataOutcome,
  ExportEstimate,
  ExportOptions,
  ExportScope,
} from "@dailyflow/application";
import { Button } from "@dailyflow/ui";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  FileArchive,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAppServices } from "../app-services-hooks.js";

const scopeOptions: ReadonlyArray<{
  readonly value: ExportScope;
  readonly label: string;
  readonly description: string;
}> = [
  { value: "all", label: "全部数据", description: "日志、知识、任务和导入记录" },
  { value: "journals", label: "每日日志", description: "正文、标签和历史投影" },
  { value: "knowledge", label: "知识库", description: "问题、方案与关联标签" },
  { value: "tasks", label: "待办", description: "任务状态和完成时间" },
  { value: "imports", label: "导入记录", description: "导入会话、条目和原始字节" },
];

function formatByteCount(bytes: number): string {
  return `${new Intl.NumberFormat("zh-CN").format(bytes)} B`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "导出失败，请重试。";
}

function OptionToggle({
  label,
  description,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-3 border border-border bg-surface p-3">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function EstimateSummary({ estimate }: { readonly estimate: ExportEstimate }): React.JSX.Element {
  return (
    <dl
      aria-label="导出估算"
      className="grid grid-cols-3 divide-x divide-border border border-border bg-surface"
    >
      {[
        { label: "实体", value: new Intl.NumberFormat("zh-CN").format(estimate.entityCount) },
        { label: "文件", value: new Intl.NumberFormat("zh-CN").format(estimate.fileCount) },
        { label: "预计大小", value: formatByteCount(estimate.estimatedBytes) },
      ].map((item) => (
        <div key={item.label} className="min-w-0 px-3 py-3">
          <dt className="text-[10px] text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words font-mono text-xs font-medium tabular-nums text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SavedResult({ outcome }: { readonly outcome: ExportDataOutcome }): React.JSX.Element {
  if (outcome.status === "cancelled") {
    return (
      <div
        role="status"
        aria-label="导出已取消"
        className="flex items-start gap-3 border border-warning/30 bg-warning/5 px-4 py-3"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">导出已取消</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            未写入文件，所选导出范围和包含项保持不变。
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
          <h2 className="text-sm font-semibold text-foreground">导出已保存</h2>
          <p className="mt-1 break-all font-mono text-[11px] leading-5 text-foreground">
            {outcome.saved.filename}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            已写入 {formatByteCount(outcome.saved.bytesWritten)}，ZIP 内共{" "}
            {outcome.artifact.fileCount} 个文件。
          </p>
        </div>
      </div>
    </div>
  );
}

export function ExportPanel(): React.JSX.Element {
  const { exports } = useAppServices();
  const [scope, setScope] = useState<ExportScope>("all");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [includeImportRawBytes, setIncludeImportRawBytes] = useState(true);
  const [estimate, setEstimate] = useState<ExportEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(true);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<ExportDataOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimateRevision, setEstimateRevision] = useState(0);

  const options: ExportOptions = {
    scope,
    includeDeleted,
    includeAttachments,
    includeImportRawBytes,
  };

  useEffect(() => {
    let active = true;
    setEstimateLoading(true);
    setEstimateError(null);
    void exports
      .estimate({
        scope,
        includeDeleted,
        includeAttachments,
        includeImportRawBytes,
      })
      .then((nextEstimate) => {
        if (active) {
          setEstimate(nextEstimate);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setEstimateError(`无法估算导出大小：${errorMessage(cause)}`);
        }
      })
      .finally(() => {
        if (active) {
          setEstimateLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [exports, scope, includeDeleted, includeAttachments, includeImportRawBytes, estimateRevision]);

  async function createExport(): Promise<void> {
    setRunning(true);
    setOutcome(null);
    setError(null);
    try {
      setOutcome(await exports.run(options));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  }

  const selectedScope = scopeOptions.find((option) => option.value === scope) ?? scopeOptions[0]!;

  return (
    <section aria-labelledby="export-panel-title" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Portable archive</p>
          <h2 id="export-panel-title" className="mt-1 text-lg font-semibold text-foreground">
            导出数据
          </h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          Markdown 与 NDJSON 从权威 Tiptap JSON 重新生成，ZIP 清单记录每个文件的 SHA-256。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4">
          <fieldset className="border border-border bg-surface p-4">
            <legend className="px-1 text-xs font-semibold text-foreground">导出范围</legend>
            <label htmlFor="export-scope" className="mt-2 block text-xs text-muted-foreground">
              选择要写入归档的数据
            </label>
            <select
              id="export-scope"
              aria-label="导出范围"
              value={scope}
              onChange={(event) => setScope(event.currentTarget.value as ExportScope)}
              className="mt-2 h-9 w-full border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            >
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {selectedScope.description}
            </p>
          </fieldset>

          <fieldset className="grid gap-2 border border-border bg-surface-muted/35 p-4">
            <legend className="px-1 text-xs font-semibold text-foreground">包含项</legend>
            <OptionToggle
              label="包含已删除内容"
              description="保留软删除标记，便于归档和后续恢复。"
              checked={includeDeleted}
              onChange={setIncludeDeleted}
            />
            <OptionToggle
              label="包含附件文件"
              description="附件按内容哈希写入 ZIP；不导出本机物理路径。"
              checked={includeAttachments}
              onChange={setIncludeAttachments}
            />
            <OptionToggle
              label="包含导入原始字节"
              description="保留可校验的 TXT 原始内容；不可用状态会如实记录。"
              checked={includeImportRawBytes}
              onChange={setIncludeImportRawBytes}
            />
          </fieldset>
        </div>

        <aside className="grid content-start gap-3 border border-border bg-surface-muted/35 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive aria-hidden="true" className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">导出估算</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="刷新导出估算"
              disabled={estimateLoading || running}
              onClick={() => setEstimateRevision((value) => value + 1)}
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-3.5 ${estimateLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          {estimate === null ? (
            <div role="status" className="border border-border bg-surface px-3 py-6 text-center">
              <LoaderCircle
                aria-hidden="true"
                className="mx-auto size-5 animate-spin text-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">正在读取本地数据概况</p>
            </div>
          ) : (
            <EstimateSummary estimate={estimate} />
          )}

          {estimateError === null ? null : (
            <p
              role="alert"
              className="border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger"
            >
              {estimateError}
            </p>
          )}

          <div className="border border-border bg-surface px-3 py-3">
            <div className="flex items-start gap-2">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              <p className="text-xs leading-5 text-muted-foreground">
                归档在内存中生成并校验哈希，已有文件不会被覆盖。
              </p>
            </div>
          </div>

          <Button disabled={running || estimateLoading} onClick={() => void createExport()}>
            {running ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <FileArchive aria-hidden="true" className="size-4" />
            )}
            {running ? "正在生成导出" : "生成并保存导出"}
          </Button>

          {error === null ? null : (
            <div
              role="alert"
              className="border border-danger/25 bg-danger/5 px-3 py-3 text-sm text-foreground"
            >
              <p className="break-words">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => void createExport()}
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                重试导出
              </Button>
            </div>
          )}

          {outcome === null ? null : <SavedResult outcome={outcome} />}
        </aside>
      </div>
    </section>
  );
}

import type {
  CommitImportInput,
  ImportCommitResult,
  ImportConflictPolicy,
  ImportPreview,
  ImportPreviewEntry,
  ImportRoot,
} from "@dailyflow/application";
import type { UtcTimestamp } from "@dailyflow/domain";
import { Button } from "@dailyflow/ui";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Database,
  FolderOpen,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { useAppServices } from "../app-services-hooks.js";
import { ImportPreviewTable } from "./import-preview-table.js";
import { canSelectPreviewEntry, formatByteCount } from "./import-preview-utils.js";
import { ImportResult } from "./import-result.js";

type ImportStage = "select" | "scan" | "preview" | "strategy" | "commit" | "result";

const stageItems = [
  { id: "select", label: "选择目录" },
  { id: "scan", label: "扫描" },
  { id: "preview", label: "预览处理" },
  { id: "strategy", label: "策略确认" },
  { id: "commit", label: "提交" },
  { id: "result", label: "结果" },
] as const satisfies ReadonlyArray<{ id: ImportStage; label: string }>;

function defaultSelectedPaths(entries: readonly ImportPreviewEntry[]): string[] {
  return entries.filter(canSelectPreviewEntry).map((entry) => entry.relativePath);
}

function stageIndex(stage: ImportStage): number {
  return stageItems.findIndex((item) => item.id === stage);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "本地导入操作失败";
}

function ImportSummary({ preview }: { readonly preview: ImportPreview }): React.JSX.Element {
  return (
    <div
      aria-label="导入预览统计"
      className="grid grid-cols-2 divide-x divide-y divide-border border border-border bg-surface sm:grid-cols-3 xl:grid-cols-6"
    >
      {[
        { label: "扫描", value: String(preview.counts.scanned) },
        { label: "就绪", value: String(preview.counts.ready) },
        { label: "跳过", value: String(preview.counts.skipped) },
        { label: "冲突", value: String(preview.counts.conflicts) },
        { label: "异常", value: String(preview.counts.invalid) },
        { label: "原始字节", value: formatByteCount(preview.estimatedBytes) },
      ].map((stat) => (
        <div key={stat.label} className="min-w-0 px-3 py-3">
          <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          <p className="mt-1 font-mono text-[11px] font-medium tabular-nums text-foreground">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function StepRail({ stage }: { readonly stage: ImportStage }): React.JSX.Element {
  const activeIndex = stageIndex(stage);
  return (
    <ol
      aria-label="导入步骤"
      className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-3 xl:grid-cols-6"
    >
      {stageItems.map((item, index) => {
        const active = item.id === stage;
        const complete = index < activeIndex;
        return (
          <li
            key={item.id}
            aria-current={active ? "step" : undefined}
            className={`flex min-w-0 items-center gap-2 bg-surface px-3 py-2.5 ${
              active ? "text-primary" : complete ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[9px] ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : complete
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-surface-muted"
              }`}
            >
              {index + 1}
            </span>
            <span className="truncate text-[11px] font-medium">{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ImportWizard(): React.JSX.Element {
  const services = useAppServices();
  const [stage, setStage] = useState<ImportStage>("select");
  const [root, setRoot] = useState<ImportRoot | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [conflictPolicy, setConflictPolicy] = useState<ImportConflictPolicy>("skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseRoot(): Promise<void> {
    setError(null);
    try {
      const selected = await services.imports.selectRoot();
      if (selected === null) {
        return;
      }
      setRoot(selected);
      setPreview(null);
      setResult(null);
      setSelectedPaths([]);
      setStage("scan");
    } catch (cause) {
      setError(`无法读取所选目录：${errorMessage(cause)}`);
    }
  }

  async function scanAndPreview(): Promise<void> {
    if (root === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const files = await services.imports.scan(root);
      const nextPreview = await services.imports.createPreview(root, files);
      setPreview(nextPreview);
      setSelectedPaths(defaultSelectedPaths(nextPreview.entries));
      setStage("preview");
    } catch (cause) {
      setError(`扫描或生成预览失败：${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  function togglePath(relativePath: string): void {
    setSelectedPaths((current) =>
      current.includes(relativePath)
        ? current.filter((path) => path !== relativePath)
        : [...current, relativePath],
    );
  }

  async function commitImport(): Promise<void> {
    if (preview === null || selectedPaths.length === 0) {
      return;
    }
    setStage("commit");
    setBusy(true);
    setError(null);
    const input: CommitImportInput = {
      sessionId: preview.session.id,
      expectedSessionRevision: preview.session.revision,
      selectedPaths,
      conflictPolicy,
      committedAt: new Date().toISOString() as UtcTimestamp,
    };
    try {
      setResult(await services.imports.commit(input));
      setStage("result");
    } catch (cause) {
      setError(`提交导入失败：${errorMessage(cause)}`);
      setStage("strategy");
    } finally {
      setBusy(false);
    }
  }

  function restart(): void {
    setStage("select");
    setRoot(null);
    setPreview(null);
    setResult(null);
    setSelectedPaths([]);
    setConflictPolicy("skip");
    setError(null);
  }

  const sameDateConflictCount =
    preview?.entries.filter((entry) => entry.conflictKind === "same_date_conflict").length ?? 0;

  return (
    <section aria-labelledby="import-wizard-title" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Local migration</p>
          <h2 id="import-wizard-title" className="mt-1 text-lg font-semibold text-foreground">
            TXT 导入向导
          </h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          原始文本以只读方式扫描；正式写入失败时整批回滚，不会留下部分日志。
        </p>
      </div>

      <StepRail stage={stage} />

      {error === null ? null : (
        <div
          role="alert"
          className="flex items-start gap-3 border border-danger/25 bg-danger/5 px-4 py-3"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="min-w-0 break-words text-sm text-foreground">{error}</p>
          {stage === "scan" && root !== null ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => void scanAndPreview()}
            >
              <RotateCw aria-hidden="true" className="size-3.5" />
              重试扫描
            </Button>
          ) : null}
        </div>
      )}

      <div className="border border-border bg-surface">
        {stage === "select" ? (
          <div className="df-dot-field grid min-h-72 place-items-center p-6 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-11 place-items-center border border-border bg-surface text-primary shadow-sm">
                <FolderOpen aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">选择历史日志目录</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                选择包含月份文件夹和每日 TXT 文件的根目录。DailyFlow
                会保留原始字节，并自动识别日期与编码。
              </p>
              <Button className="mt-5" onClick={() => void chooseRoot()}>
                <FolderOpen aria-hidden="true" className="size-4" />
                选择 TXT 目录
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "scan" ? (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-11 place-items-center border border-border bg-surface-muted text-primary">
                <Database aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-4 font-mono text-[10px] uppercase text-muted-foreground">
                Selected root
              </p>
              <h3 className="mt-1 break-all text-base font-semibold text-foreground">
                {root?.label ?? "尚未选择目录"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                扫描只读取 TXT 文件并生成导入预览，此步骤不会写入日志。
              </p>
              <Button
                className="mt-5"
                disabled={busy || root === null}
                onClick={() => void scanAndPreview()}
              >
                {busy ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <ArrowRight aria-hidden="true" className="size-4" />
                )}
                {busy ? "正在扫描并分析" : "扫描并生成预览"}
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "preview" && preview !== null ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">导入预览</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  已选择 {selectedPaths.length} / {preview.entries.length} 个文件
                </p>
              </div>
              <Button size="sm" onClick={() => setStage("strategy")}>
                进入导入策略
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="p-4">
              <ImportSummary preview={preview} />
              <div className="mt-4">
                <ImportPreviewTable
                  entries={preview.entries}
                  selectedPaths={new Set(selectedPaths)}
                  onToggle={togglePath}
                />
              </div>
            </div>
          </div>
        ) : null}

        {stage === "strategy" && preview !== null ? (
          <div className="grid gap-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase text-muted-foreground">
                  Review before commit
                </p>
                <h3 className="mt-1 text-base font-semibold text-foreground">确认导入策略</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  本次将提交 {selectedPaths.length} 个文件。异常和未选择文件不会创建正式日志。
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStage("preview")}>
                <ArrowLeft aria-hidden="true" className="size-3.5" />
                返回预览
              </Button>
            </div>

            <fieldset className="grid gap-2 border border-border p-4">
              <legend className="px-1 text-xs font-semibold text-foreground">
                同日期已有日志时
              </legend>
              <label className="flex cursor-pointer items-start gap-3 border border-border bg-surface-muted/45 p-3 text-sm">
                <input
                  type="radio"
                  name="conflict-policy"
                  value="skip"
                  aria-label="保留现有日志并跳过"
                  checked={conflictPolicy === "skip"}
                  onChange={() => setConflictPolicy("skip")}
                  className="mt-1 size-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-foreground">保留现有日志并跳过</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    更安全；同日期文件不计入创建数。
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border border-border bg-surface-muted/45 p-3 text-sm">
                <input
                  type="radio"
                  name="conflict-policy"
                  value="new_version"
                  aria-label="同日期内容建立新版本"
                  checked={conflictPolicy === "new_version"}
                  onChange={() => setConflictPolicy("new_version")}
                  className="mt-1 size-4 accent-primary"
                />
                <span>
                  <span className="block font-medium text-foreground">同日期内容建立新版本</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    当前发现 {sameDateConflictCount} 个同日期冲突；旧版本仍可恢复。
                  </span>
                </span>
              </label>
            </fieldset>

            {preview.entries.some((entry) => entry.issue !== null) ? (
              <details className="border border-warning/30 bg-warning/5 px-4 py-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  查看 {preview.counts.invalid} 个异常文件详情
                </summary>
                <ul className="mt-3 grid gap-2">
                  {preview.entries
                    .filter((entry) => entry.issue !== null)
                    .map((entry) => (
                      <li
                        key={entry.entryId}
                        className="break-words font-mono text-[10px] leading-5 text-danger"
                      >
                        {entry.relativePath} · {entry.errorCode} · {entry.errorMessage}
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button disabled={selectedPaths.length === 0} onClick={() => void commitImport()}>
                <ShieldCheck aria-hidden="true" className="size-4" />
                确认导入 {selectedPaths.length} 个文件
              </Button>
              <p className="text-xs text-muted-foreground">
                提交使用会话版本校验；任一条目失败会回滚整批正式日志。
              </p>
            </div>
          </div>
        ) : null}

        {stage === "commit" ? (
          <div role="status" className="grid min-h-72 place-items-center p-6 text-center">
            <div>
              <LoaderCircle
                aria-hidden="true"
                className="mx-auto size-6 animate-spin text-primary"
              />
              <h3 className="mt-4 text-base font-semibold text-foreground">正在提交导入</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                正在写入日志、历史版本和搜索索引，请保持应用开启。
              </p>
            </div>
          </div>
        ) : null}

        {stage === "result" && preview !== null && result !== null ? (
          <div className="p-4">
            <ImportResult result={result} preview={preview} onRestart={restart} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

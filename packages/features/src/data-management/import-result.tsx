import type { ImportCommitResult, ImportPreview } from "@dailyflow/application";
import { Button } from "@dailyflow/ui";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import { formatByteCount } from "./import-preview-utils.js";

export interface ImportResultProps {
  readonly result: ImportCommitResult;
  readonly preview: ImportPreview;
  readonly onRestart: () => void;
}

export function ImportResult({ result, preview, onRestart }: ImportResultProps): React.JSX.Element {
  const completed = result.status === "completed";
  const failedCount = preview.counts.invalid + result.failedCount;

  return (
    <section aria-labelledby="import-result-title" className="border border-border bg-surface">
      <div className="flex items-start gap-3 border-b border-border px-5 py-5">
        <span
          className={`mt-0.5 grid size-9 shrink-0 place-items-center border ${
            completed
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/25 bg-danger/5 text-danger"
          }`}
        >
          {completed ? (
            <CheckCircle2 aria-hidden="true" className="size-5" />
          ) : (
            <XCircle aria-hidden="true" className="size-5" />
          )}
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Import result</p>
          <h2 id="import-result-title" className="mt-1 text-xl font-semibold text-foreground">
            {completed ? "导入完成" : "导入失败"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {completed
              ? "正式日志已写入本地存储，原始 TXT 捕获信息已保留在导入记录中。"
              : "正式日志未部分写入。请检查存储状态、保留原文件后重新导入。"}
          </p>
        </div>
      </div>

      <div
        aria-label="导入结果统计"
        className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 xl:grid-cols-6"
      >
        {[
          `创建 ${result.importedCount}`,
          `跳过 ${result.skippedCount}`,
          `异常 ${failedCount}`,
          `扫描 ${preview.counts.scanned}`,
          `冲突 ${preview.counts.conflicts}`,
          `原始字节 ${formatByteCount(preview.estimatedBytes)}`,
        ].map((label) => (
          <div
            key={label}
            className="min-w-0 px-4 py-4 font-mono text-xs font-medium tabular-nums text-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        <Button variant="secondary" size="sm" onClick={onRestart}>
          <RotateCcw aria-hidden="true" className="size-3.5" />
          导入另一目录
        </Button>
        <p className="text-xs text-muted-foreground">
          本次会话 {result.sessionId.slice(0, 8)} · 可在导入记录中追溯。
        </p>
      </div>
    </section>
  );
}

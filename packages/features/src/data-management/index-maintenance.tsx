import type { SearchRebuildProgress } from "@dailyflow/application";
import { Button } from "@dailyflow/ui";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useRef, useState } from "react";

import type { DataManagementRuntimeServices } from "../app-services-context.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "索引重建失败，旧索引保持不变。";
}

export interface IndexMaintenanceProps {
  readonly services: DataManagementRuntimeServices;
  readonly onCompleted?: () => void;
}

export function IndexMaintenance({
  services,
  onCompleted,
}: IndexMaintenanceProps): React.JSX.Element {
  const abortRef = useRef<AbortController | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SearchRebuildProgress | null>(null);
  const [result, setResult] = useState<"completed" | "cancelled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rebuild(): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress(null);
    setResult(null);
    setError(null);
    try {
      const outcome = await services.rebuildSearchIndex({
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(outcome.status);
      if (outcome.status === "completed") {
        setExpanded(false);
        onCompleted?.();
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(errorMessage(cause));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setRunning(false);
    }
  }

  function cancel(): void {
    abortRef.current?.abort();
    setResult("cancelled");
  }

  return (
    <section aria-labelledby="index-maintenance-title" className="border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center border border-primary/25 bg-primary/5 text-primary">
            <Search aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2 id="index-maintenance-title" className="text-sm font-semibold text-foreground">
              搜索索引维护
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              从权威内容重新生成搜索正文、结构化块、知识和任务的索引。重建失败或取消时保留旧索引。
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={expanded}
          disabled={running}
          onClick={() => {
            setExpanded((value) => !value);
            setResult(null);
            setError(null);
          }}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          检查并重建索引
        </Button>
      </div>

      {expanded ? (
        <div className="border-t border-border bg-surface-muted/30 p-4">
          <div className="flex items-start gap-3 border border-warning/30 bg-warning/5 px-3 py-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">重建期间保持应用开启</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                新索引会先写入临时状态，全部完成后原子替换旧索引。日志正文和历史版本不会在本操作中修改。
              </p>
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-3 border border-border bg-surface px-3 py-3">
            <input
              type="checkbox"
              aria-label="我了解重建期间不应关闭应用"
              checked={acknowledged}
              disabled={running}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="text-xs leading-5 text-foreground">
              我了解重建期间不应关闭应用，并确认从权威内容重新生成索引。
            </span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {running ? (
              <Button variant="secondary" size="sm" onClick={cancel}>
                <AlertCircle aria-hidden="true" className="size-3.5" />
                取消重建
              </Button>
            ) : (
              <Button size="sm" disabled={!acknowledged} onClick={() => void rebuild()}>
                <RefreshCw aria-hidden="true" className="size-3.5" />
                确认重建
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {running || progress !== null ? (
        <div role="status" className="border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-foreground">
              <LoaderCircle
                aria-hidden="true"
                className={`size-4 text-primary ${running ? "animate-spin" : ""}`}
              />
              {progress === null
                ? "正在准备权威内容快照"
                : `已处理 ${progress.processedCount} / ${progress.totalCount}`}
            </div>
            {progress === null ? null : (
              <span className="font-mono text-[10px] text-muted-foreground">{progress.phase}</span>
            )}
          </div>
          {progress === null || progress.totalCount === 0 ? null : (
            <div className="mt-2 h-1 overflow-hidden bg-surface-muted" aria-hidden="true">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{
                  width: `${Math.min(100, (progress.processedCount / progress.totalCount) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      ) : null}

      {result === "cancelled" ? (
        <div
          role="status"
          className="flex items-start gap-2 border-t border-warning/25 bg-warning/5 px-4 py-3"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs leading-5 text-foreground">索引重建已取消，旧索引保持不变。</p>
        </div>
      ) : null}
      {result === "completed" ? (
        <div
          role="status"
          className="flex items-start gap-2 border-t border-success/25 bg-success/5 px-4 py-3"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-xs leading-5 text-foreground">
            搜索索引已重建，权威正文和历史版本未修改。
          </p>
        </div>
      ) : null}
      {error === null ? null : (
        <div role="alert" className="border-t border-danger/25 bg-danger/5 px-4 py-3">
          <p className="text-xs leading-5 text-danger">{error}</p>
        </div>
      )}
    </section>
  );
}

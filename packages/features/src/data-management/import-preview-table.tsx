import type { ImportPreviewEntry } from "@dailyflow/application";
import { AlertCircle, CheckCircle2, FileWarning, ShieldAlert } from "lucide-react";

export interface ImportPreviewTableProps {
  readonly entries: readonly ImportPreviewEntry[];
  readonly selectedPaths: ReadonlySet<string>;
  readonly onToggle: (relativePath: string) => void;
}

const statusLabels: Record<ImportPreviewEntry["status"], string> = {
  ready: "就绪",
  skipped: "跳过",
  conflict: "冲突",
  invalid: "异常",
};

const statusClasses: Record<ImportPreviewEntry["status"], string> = {
  ready: "border-success/25 bg-success/5 text-success",
  skipped: "border-border bg-surface-muted text-muted-foreground",
  conflict: "border-warning/30 bg-warning/10 text-warning",
  invalid: "border-danger/25 bg-danger/5 text-danger",
};

const conflictLabels: Record<NonNullable<ImportPreviewEntry["conflictKind"]>, string> = {
  duplicate_path: "重复路径",
  duplicate_content: "重复内容",
  same_date_conflict: "同日期已有日志",
  duplicate_date_in_batch: "本批日期重复",
};

const encodingLabels: Record<ImportPreviewEntry["encoding"], string> = {
  "utf8-bom": "UTF-8 BOM",
  utf8: "UTF-8",
  gb18030: "GB18030",
  unknown: "未识别",
};

const newlineLabels: Record<ImportPreviewEntry["newlineStyle"], string> = {
  lf: "LF",
  crlf: "CRLF",
  mixed: "混合",
  unknown: "未知",
};

export function formatByteCount(bytes: number): string {
  return `${new Intl.NumberFormat("zh-CN").format(bytes)} B`;
}

export function canSelectPreviewEntry(entry: ImportPreviewEntry): boolean {
  return (
    entry.status === "ready" ||
    (entry.status === "conflict" && entry.conflictKind === "same_date_conflict")
  );
}

function EntryStatusIcon({
  status,
}: {
  readonly status: ImportPreviewEntry["status"];
}): React.JSX.Element {
  if (status === "ready") {
    return <CheckCircle2 aria-hidden="true" className="size-3.5" />;
  }
  if (status === "conflict") {
    return <ShieldAlert aria-hidden="true" className="size-3.5" />;
  }
  if (status === "invalid") {
    return <AlertCircle aria-hidden="true" className="size-3.5" />;
  }
  return <FileWarning aria-hidden="true" className="size-3.5" />;
}

export function ImportPreviewTable({
  entries,
  selectedPaths,
  onToggle,
}: ImportPreviewTableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table aria-label="TXT 导入预览" className="w-full min-w-[58rem] border-collapse text-sm">
        <thead className="bg-surface-muted/70 text-left text-[10px] uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="w-12 px-3 py-2 font-medium">
              选择
            </th>
            <th scope="col" className="min-w-52 px-3 py-2 font-medium">
              文件
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              日期
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              状态
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              编码 / 换行
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              原始大小
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              内容摘要
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                当前目录没有可导入的 TXT 文件。
              </td>
            </tr>
          ) : (
            entries.map((entry) => {
              const selectable = canSelectPreviewEntry(entry);
              const selected = selectedPaths.has(entry.relativePath);
              return (
                <tr key={entry.entryId} className={selected ? "bg-primary/[0.035]" : undefined}>
                  <td className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${entry.relativePath}`}
                      checked={selected}
                      disabled={!selectable}
                      onChange={() => onToggle(entry.relativePath)}
                      className="mt-0.5 size-4 accent-primary"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <p className="break-all font-mono text-xs font-medium text-foreground">
                      {entry.relativePath}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      原始捕获：{entry.rawCaptureStatus === "captured" ? "已保留" : "不可用"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-xs tabular-nums text-foreground">
                    {entry.detectedDate ?? "未识别"}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] ${statusClasses[entry.status]}`}
                    >
                      <EntryStatusIcon status={entry.status} />
                      {statusLabels[entry.status]}
                    </span>
                    {entry.conflictKind === null ? null : (
                      <p className="mt-1 max-w-36 text-[10px] leading-4 text-muted-foreground">
                        {conflictLabels[entry.conflictKind]}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-[10px] text-muted-foreground">
                    <p>{encodingLabels[entry.encoding]}</p>
                    <p className="mt-1">{newlineLabels[entry.newlineStyle]}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-xs tabular-nums text-foreground">
                    {entry.byteSize === null ? "未知" : formatByteCount(entry.byteSize)}
                  </td>
                  <td className="max-w-72 px-3 py-3 align-top">
                    <p className="line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                      {entry.excerpt || "无可用正文预览"}
                    </p>
                    {entry.issue === null ? null : (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] font-medium text-danger">
                          展开错误详情
                        </summary>
                        <p className="mt-1 break-words border-l-2 border-danger/40 pl-2 text-[10px] leading-4 text-danger">
                          {entry.errorCode}: {entry.errorMessage}
                        </p>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

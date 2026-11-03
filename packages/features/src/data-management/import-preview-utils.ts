import type { ImportPreviewEntry } from "@dailyflow/application";

export function formatByteCount(bytes: number): string {
  return `${new Intl.NumberFormat("zh-CN").format(bytes)} B`;
}

export function canSelectPreviewEntry(entry: ImportPreviewEntry): boolean {
  return (
    entry.status === "ready" ||
    (entry.status === "conflict" && entry.conflictKind === "same_date_conflict")
  );
}

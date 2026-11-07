import { ArrowRight } from "lucide-react";

import { useAppText } from "../preferences/use-app-text.js";

export interface VersionComparisonProps {
  readonly currentMarkdown: string;
  readonly previousMarkdown: string;
  readonly previousRevision: number;
}

export function VersionComparison({
  currentMarkdown,
  previousMarkdown,
  previousRevision,
}: VersionComparisonProps): React.JSX.Element {
  const text = useAppText();

  return (
    <section
      aria-label={text("版本对比", "Version comparison")}
      className="grid min-w-0 gap-2 rounded-[var(--radius-control)] border border-border bg-surface p-2"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <span>{text("当前草稿", "Current draft")}</span>
        <ArrowRight aria-hidden="true" className="size-3" />
        <span>{text(`版本 ${previousRevision}`, `Version ${previousRevision}`)}</span>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {text("当前草稿内容", "Current draft content")}
          </p>
          <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-control)] bg-surface-muted p-2 text-xs leading-5 text-foreground">
            {currentMarkdown.trim() || text("当前草稿没有正文", "The current draft is empty")}
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {text("历史版本内容", "Historical version content")}
          </p>
          <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-control)] bg-surface-muted p-2 text-xs leading-5 text-foreground">
            {previousMarkdown.trim() || text("此版本没有正文", "This version is empty")}
          </p>
        </div>
      </div>
    </section>
  );
}

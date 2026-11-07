import type { EntityId, LocalDate } from "@dailyflow/domain";
import { CornerUpLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { useAppText } from "../preferences/use-app-text.js";

export interface KnowledgeSourceLinkProps {
  readonly sourceJournalDate: LocalDate | null;
  readonly sourceJournalAvailable: boolean;
  readonly sourceBlockId: EntityId | null;
}

export function KnowledgeSourceLink({
  sourceJournalDate,
  sourceJournalAvailable,
  sourceBlockId,
}: KnowledgeSourceLinkProps): React.JSX.Element | null {
  const text = useAppText();

  if (!sourceJournalAvailable || sourceJournalDate === null) {
    return (
      <aside className="mt-8 border-t border-border pt-5">
        <p className="text-xs font-semibold text-foreground">
          {text("来源不可用", "Source unavailable")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {text(
            "来源日志已删除或当前无法访问，知识正文仍可正常使用。",
            "The source journal was deleted or is currently unavailable. The knowledge body remains usable.",
          )}
        </p>
      </aside>
    );
  }

  const destination =
    sourceBlockId === null
      ? `/journal/${sourceJournalDate}`
      : `/journal/${sourceJournalDate}#block-${sourceBlockId}`;

  return (
    <aside className="mt-8 border-t border-border pt-5">
      <p className="text-xs font-semibold text-foreground">{text("来源", "Source")}</p>
      <Link
        to={destination}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <CornerUpLeft aria-hidden="true" className="size-3.5" />
        {text(`原始日志 · ${sourceJournalDate}`, `Original journal · ${sourceJournalDate}`)}
      </Link>
      {sourceBlockId === null ? null : (
        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
          {text(`来源块 ${sourceBlockId}`, `Source block ${sourceBlockId}`)}
        </p>
      )}
    </aside>
  );
}

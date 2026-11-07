import type { JournalVersionSummary, SavedJournalSnapshot } from "@dailyflow/application";
import type { EntityId, JournalVersion as DomainJournalVersion } from "@dailyflow/domain";
import { jsonToPlainText, type TiptapJsonNode } from "@dailyflow/editor";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, HistoryList, type HistoryListItem } from "@dailyflow/ui";

import { useAppServices } from "../app-services-hooks.js";
import { useOptionalAppMessages } from "../preferences/use-app-messages.js";
import { useAppText } from "../preferences/use-app-text.js";
import { VersionComparison } from "./version-comparison.js";

const HISTORY_PAGE_SIZE = 20;

function formatVersionDate(timestamp: string, locale: "zh-CN" | "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function previewVersion(version: DomainJournalVersion, emptyLabel: string): string {
  return jsonToPlainText(version.content.doc as TiptapJsonNode).trim() || emptyLabel;
}

export interface HistoryPanelProps {
  readonly journalId: EntityId;
  readonly currentRevision: number;
  readonly currentMarkdown: string;
  readonly onRestored: (snapshot: SavedJournalSnapshot) => void;
  readonly onClose: () => void;
}

export function HistoryPanel({
  journalId,
  currentRevision,
  currentMarkdown,
  onRestored,
  onClose,
}: HistoryPanelProps): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const locale = useOptionalAppMessages()?.locale ?? "zh-CN";
  const [summaries, setSummaries] = useState<readonly JournalVersionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<DomainJournalVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingRevision, setSelectingRevision] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await services.journal.listVersions(journalId, {
          ...(cursor === undefined ? {} : { cursor }),
          limit: HISTORY_PAGE_SIZE,
        });
        setSummaries((current) =>
          cursor === undefined ? page.items : [...current, ...page.items],
        );
        setNextCursor(page.nextCursor);
      } catch {
        setError(text("历史版本加载失败", "Failed to load version history"));
      } finally {
        setLoading(false);
      }
    },
    [journalId, services.journal, text],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function selectVersion(revision: number): Promise<void> {
    setSelectingRevision(revision);
    setError(null);
    try {
      const version = await services.journal.getVersion(journalId, revision);
      if (version === null) {
        setError(text("该历史版本已不存在", "This historical version no longer exists"));
        setSelected(null);
        return;
      }
      setSelected(version);
    } catch {
      setError(text("历史版本读取失败", "Failed to read the historical version"));
    } finally {
      setSelectingRevision(null);
    }
  }

  async function restoreSelectedVersion(): Promise<void> {
    if (selected === null || currentRevision < 1) {
      return;
    }

    setRestoring(true);
    setError(null);
    try {
      const result = await services.journal.restore({
        journalId,
        versionRevision: selected.revision,
        expectedCurrentRevision: currentRevision,
      });
      if (!result.ok) {
        setError(
          result.error.code === "CONFLICT"
            ? text(
                "当前日志已变化，请重新加载历史版本",
                "The journal changed. Reload version history and try again.",
              )
            : text("版本恢复失败", "Failed to restore this version"),
        );
        return;
      }
      onRestored(result.value);
    } catch {
      setError(text("版本恢复失败", "Failed to restore this version"));
    } finally {
      setRestoring(false);
    }
  }

  const items: readonly HistoryListItem[] = summaries.map((summary) => ({
    id: String(summary.revision),
    label: text(
      `版本 ${summary.revision} · ${summary.title.trim() || "无标题日志"}`,
      `Version ${summary.revision} · ${summary.title.trim() || "Untitled journal"}`,
    ),
    timestamp: formatVersionDate(summary.createdAt, locale),
    ...(summary.revision === currentRevision
      ? { detail: text("当前版本", "Current version") }
      : {}),
  }));

  return (
    <aside
      aria-label={text("日志历史版本", "Journal version history")}
      className="flex min-h-0 min-w-0 flex-col border-border bg-surface max-[899px]:border-t lg:w-80 lg:border-l"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {text("历史版本", "Version history")}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {text("恢复会生成新的 revision", "Restoring creates a new revision")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={text("关闭历史版本", "Close version history")}
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <HistoryList
        items={items}
        selectedId={selected === null ? null : String(selected.revision)}
        emptyLabel={text("还没有历史版本", "No version history yet")}
        loadingLabel={text("正在加载版本", "Loading versions")}
        loadMoreLabel={text("加载更多版本", "Load more versions")}
        loading={loading || selectingRevision !== null}
        hasMore={nextCursor !== null}
        onSelect={(id) => {
          void selectVersion(Number(id));
        }}
        onLoadMore={() => {
          if (nextCursor !== null) {
            void loadPage(nextCursor);
          }
        }}
      />

      {selected ? (
        <section
          aria-label={text(
            `版本 ${selected.revision} 预览`,
            `Version ${selected.revision} preview`,
          )}
          className="shrink-0 border-t border-border p-3"
        >
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-foreground">
              {text(`版本 ${selected.revision} 预览`, `Version ${selected.revision} preview`)}
            </p>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {selected.changeSource}
            </span>
          </div>
          <VersionComparison
            currentMarkdown={currentMarkdown}
            previousMarkdown={previewVersion(
              selected,
              text("该版本没有正文", "This version has no content"),
            )}
            previousRevision={selected.revision}
          />
          <Button
            className="mt-2 w-full"
            size="sm"
            disabled={restoring || currentRevision < 1}
            onClick={() => {
              void restoreSelectedVersion();
            }}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {restoring ? text("正在恢复", "Restoring") : text("恢复此版本", "Restore this version")}
          </Button>
        </section>
      ) : null}
    </aside>
  );
}

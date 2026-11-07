import type { KnowledgeSummary } from "@dailyflow/application";
import type { KnowledgeKind } from "@dailyflow/domain";
import { Button, SegmentedControl } from "@dailyflow/ui";
import { AlertCircle, BookOpenText, Plus, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { useAppText } from "../preferences/use-app-text.js";
import { KnowledgeCreateDialog } from "./knowledge-create-dialog.js";
import { knowledgeKindLabel, knowledgeKindOptions } from "./knowledge-labels.js";

type KnowledgeFilter = "all" | KnowledgeKind;

export function KnowledgePage(): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const [filter, setFilter] = useState<KnowledgeFilter>("all");
  const [items, setItems] = useState<readonly KnowledgeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await services.knowledge.list({
        status: "active",
        ...(filter === "all" ? {} : { kind: filter }),
      });
      setItems(page.items);
    } catch {
      setItems([]);
      setError(text("知识库加载失败", "Failed to load the knowledge base"));
    } finally {
      setLoading(false);
    }
  }, [filter, services.knowledge, text]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, reloadVersion]);

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">
            {text("个人记忆", "Personal memory")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            {text("知识库", "Knowledge Base")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(
              "将日志中的问题、方案和决策沉淀为可复用知识。",
              "Turn problems, solutions, and decisions from journals into reusable knowledge.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label={text("知识类型", "Knowledge type")}
            value={filter}
            onChange={setFilter}
            options={[{ label: text("全部", "All"), value: "all" }, ...knowledgeKindOptions(text)]}
          />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {text("新建知识", "New knowledge")}
          </Button>
        </div>
      </header>

      <KnowledgeCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {error === null ? null : (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center gap-3 border border-danger/25 bg-danger/5 px-4 py-3"
        >
          <AlertCircle aria-hidden="true" className="size-4 text-danger" />
          <p className="text-sm text-foreground">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setReloadVersion((version) => version + 1)}
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            {text("重试", "Try again")}
          </Button>
        </div>
      )}

      <section aria-labelledby="knowledge-list-title" className="mt-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpenText aria-hidden="true" className="size-4 text-primary" />
          <h2 id="knowledge-list-title" className="text-sm font-semibold text-foreground">
            {filter === "all"
              ? text("全部知识", "All knowledge")
              : knowledgeKindLabel(filter, text)}
          </h2>
          {!loading ? (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {text(`${items.length} 条`, `${items.length} item${items.length === 1 ? "" : "s"}`)}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm">
            <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
            {text("正在加载知识库", "Loading knowledge base")}
          </div>
        ) : items.length === 0 ? (
          <div className="grid min-h-56 place-items-center border border-border bg-surface text-center">
            <div>
              <BookOpenText aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">
                {text("这里还没有知识条目", "No knowledge items yet")}
              </p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                <p>{text("手动新建知识条目。", "Create a knowledge item manually.")}</p>
                <p>
                  {text("从每日日志沉淀整篇内容。", "Save a complete daily journal as knowledge.")}
                </p>
                <p>
                  {text(
                    "选中结构化块后只沉淀该块。",
                    "Select a structured block to save only that block.",
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <li key={item.id}>
                <article
                  aria-label={item.title}
                  className="flex h-full min-h-36 flex-col border border-border bg-surface p-4 transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center gap-2">
                    <span className="border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {knowledgeKindLabel(item.kind, text)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      r{item.revision}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-sm font-semibold text-foreground">
                    <Link to={`/knowledge/${item.id}`} className="hover:text-primary">
                      {item.title}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {item.summary || text("暂无摘要", "No summary")}
                  </p>
                  <span className="mt-auto pt-4 font-mono text-[10px] text-muted-foreground">
                    {item.updatedAt.slice(0, 10)}
                  </span>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

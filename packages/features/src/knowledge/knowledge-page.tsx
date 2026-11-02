import type { KnowledgeSummary } from "@dailyflow/application";
import type { KnowledgeKind } from "@dailyflow/domain";
import { Button, SegmentedControl } from "@dailyflow/ui";
import { AlertCircle, BookOpenText, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";

type KnowledgeFilter = "all" | KnowledgeKind;

const kindLabels: Record<KnowledgeKind, string> = {
  note: "笔记",
  issue: "问题",
  solution: "方案",
  decision: "决策",
  reference: "参考",
};

export function KnowledgePage(): React.JSX.Element {
  const services = useAppServices();
  const [filter, setFilter] = useState<KnowledgeFilter>("all");
  const [items, setItems] = useState<readonly KnowledgeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

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
      setError("知识库加载失败");
    } finally {
      setLoading(false);
    }
  }, [filter, services.knowledge]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, reloadVersion]);

  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Personal memory</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">知识库</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            将日志中的问题、方案和决策沉淀为可复用知识。
          </p>
        </div>
        <SegmentedControl
          label="知识类型"
          value={filter}
          onChange={setFilter}
          options={[
            { label: "全部", value: "all" },
            { label: "问题", value: "issue" },
            { label: "方案", value: "solution" },
            { label: "决策", value: "decision" },
            { label: "笔记", value: "note" },
            { label: "参考", value: "reference" },
          ]}
        />
      </header>

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
            重试
          </Button>
        </div>
      )}

      <section aria-labelledby="knowledge-list-title" className="mt-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpenText aria-hidden="true" className="size-4 text-primary" />
          <h2 id="knowledge-list-title" className="text-sm font-semibold text-foreground">
            {filter === "all" ? "全部知识" : kindLabels[filter]}
          </h2>
          {!loading ? (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {items.length} 条
            </span>
          ) : null}
        </div>

        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm">
            <RotateCw aria-hidden="true" className="size-4 animate-spin text-primary" />
            正在加载知识库
          </div>
        ) : items.length === 0 ? (
          <div className="grid min-h-56 place-items-center border border-border bg-surface text-center">
            <div>
              <BookOpenText aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">这里还没有知识条目</p>
              <p className="mt-1 text-xs text-muted-foreground">可从日志中的结构化块提升内容。</p>
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
                      {kindLabels[item.kind]}
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
                    {item.summary || "暂无摘要"}
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

import type { SearchHit, SearchResultPage } from "@dailyflow/application";
import { Button, Input } from "@dailyflow/ui";
import { AlertTriangle, FileSearch, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { useAppText } from "../preferences/use-app-text.js";
import { SearchHighlight } from "./search-highlight.js";
import { searchResultPath } from "./search-result-path.js";

type SearchIndexState = SearchResultPage["indexState"];

function IndexStateNotice({
  state,
  rebuilding,
  onRebuild,
}: {
  readonly state: SearchIndexState;
  readonly rebuilding: boolean;
  readonly onRebuild: () => void;
}): React.JSX.Element {
  const text = useAppText();

  if (state === "ready") {
    return <p className="text-xs text-success">{text("索引已就绪", "Search index ready")}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border border-warning/30 bg-warning/5 px-3 py-2">
      <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />
      <p className="text-xs text-foreground">
        {state === "stale"
          ? text("索引待重建", "Search index needs rebuilding")
          : text("索引不可用，可尝试重建", "Search index unavailable. Try rebuilding it.")}
      </p>
      <Button variant="ghost" size="sm" disabled={rebuilding} onClick={onRebuild}>
        <RefreshCw aria-hidden="true" className={`size-3.5 ${rebuilding ? "animate-spin" : ""}`} />
        {text("重建索引", "Rebuild index")}
      </Button>
    </div>
  );
}

export function SearchPage(): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [result, setResult] = useState<SearchResultPage | null>(null);
  const [indexState, setIndexState] = useState<SearchIndexState>("ready");
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    let active = true;
    if (query.trim() === "") {
      setResult(null);
      setError(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    void services.search
      .query({ text: query.trim(), limit: 30 })
      .then((page) => {
        if (active) {
          setResult(page);
          setIndexState(page.indexState);
        }
      })
      .catch(() => {
        if (active) {
          setResult(null);
          setError(text("搜索失败，请稍后重试", "Search failed. Try again later."));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [query, services.search, text]);

  async function rebuild(): Promise<void> {
    setRebuilding(true);
    setError(null);
    try {
      await services.search.rebuild();
      setIndexState("ready");
    } catch {
      setIndexState("failed");
      setError(
        text("索引重建失败，请稍后重试", "Failed to rebuild the search index. Try again later."),
      );
    } finally {
      setRebuilding(false);
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = draft.trim();
    setParams(next === "" ? {} : { q: next });
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-[10px] uppercase text-primary">
          {text("全局检索", "Global retrieval")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {text("全局搜索", "Global Search")}
        </h1>
        <form role="search" className="mt-4 flex max-w-2xl gap-2" onSubmit={submitSearch}>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={text("搜索日志、知识和任务", "Search journals, knowledge, and tasks")}
              value={draft}
              autoFocus
              placeholder={text(
                "输入关键词，搜索日志、知识和待办",
                "Enter keywords to search journals, knowledge, and tasks",
              )}
              className="pl-9"
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </div>
          <Button type="submit">{text("搜索", "Search")}</Button>
        </form>
      </header>

      {result !== null ? (
        <div className="mt-4">
          <IndexStateNotice
            state={indexState}
            rebuilding={rebuilding}
            onRebuild={() => void rebuild()}
          />
        </div>
      ) : null}

      {error === null ? null : (
        <div role="alert" className="mt-4 border border-danger/25 bg-danger/5 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <section aria-labelledby="search-results-title" className="mt-5">
        <div className="flex items-center gap-2">
          <FileSearch aria-hidden="true" className="size-4 text-primary" />
          <h2 id="search-results-title" className="text-sm font-semibold text-foreground">
            {text("搜索结果", "Search results")}
          </h2>
          {result === null ? null : (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {text(
                `${result.items.length} 条`,
                `${result.items.length} result${result.items.length === 1 ? "" : "s"}`,
              )}
            </span>
          )}
        </div>

        {loading ? (
          <div role="status" className="flex min-h-48 items-center justify-center text-sm">
            {text("正在搜索", "Searching")}
          </div>
        ) : query.trim() === "" ? (
          <div className="mt-3 grid min-h-48 place-items-center border border-border bg-surface text-center">
            <div>
              <Search aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {text("输入关键词开始搜索。", "Enter keywords to start searching.")}
              </p>
            </div>
          </div>
        ) : result?.items.length === 0 ? (
          <div className="mt-3 grid min-h-48 place-items-center border border-border bg-surface text-center">
            <p className="text-sm text-muted-foreground">
              {text("没有找到匹配内容。", "No matching results.")}
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border border border-border bg-surface">
            {result?.items.map((item: SearchHit) => (
              <li key={`${item.entityType}-${item.entityId}`}>
                <Link
                  to={searchResultPath(item)}
                  className="block px-4 py-4 transition-colors hover:bg-surface-muted/65"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase text-primary">
                      {item.entityType === "journal"
                        ? text("日志", "Journal")
                        : item.entityType === "knowledge_item"
                          ? text("知识", "Knowledge")
                          : item.entityType === "task"
                            ? text("待办", "Task")
                            : text("结构化块", "Structured block")}
                    </span>
                    {item.localDate === null ? null : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {item.localDate}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {text(`匹配 ${Math.round(item.score)}`, `Score ${Math.round(item.score)}`)}
                    </span>
                  </div>
                  <h3 className="mt-1 break-words text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    <SearchHighlight result={item} query={query} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

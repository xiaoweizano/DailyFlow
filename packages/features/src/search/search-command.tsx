import type { SearchHit } from "@dailyflow/application";
import { Input } from "@dailyflow/ui";
import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@dailyflow/ui";

import { useAppServices } from "../app-services-hooks.js";
import { searchResultPath } from "./search-result-path.js";

export interface SearchCommandProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps): React.JSX.Element {
  const services = useAppServices();
  const navigate = useNavigate();
  const listboxId = useId();
  const optionId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchHit[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const text = query.trim();
    if (text === "") {
      setResults([]);
      setSelectedIndex(-1);
      return undefined;
    }

    let active = true;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      void services.search
        .query({ text, limit: 8 })
        .then((page) => {
          if (active) {
            setResults(page.items);
            setSelectedIndex(page.items.length === 0 ? -1 : 0);
          }
        })
        .catch(() => {
          if (active) {
            setResults([]);
            setSelectedIndex(-1);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [open, query, services.search]);

  function openResult(result: SearchHit): void {
    onOpenChange(false);
    navigate(searchResultPath(result));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) =>
        results.length === 0 ? -1 : Math.min(current + 1, results.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current <= 0 ? 0 : current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const selected = results[selectedIndex];
      if (selected !== undefined) {
        event.preventDefault();
        openResult(selected);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18vh] max-h-[min(70vh,620px)] translate-y-0 p-0">
        <DialogTitle className="sr-only">全局搜索</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <Input
            role="combobox"
            aria-label="搜索关键词"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={results.length > 0}
            aria-activedescendant={
              selectedIndex < 0 ? undefined : `${optionId}-${selectedIndex}`
            }
            autoFocus
            value={query}
            placeholder="搜索日志、知识和待办"
            className="h-12 border-0 bg-transparent px-0 shadow-none focus:ring-0"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="min-h-24 overflow-y-auto p-2">
          {query.trim() === "" ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              输入关键词开始搜索
            </p>
          ) : loading && results.length === 0 ? (
            <p role="status" className="px-3 py-8 text-center text-xs text-muted-foreground">
              正在搜索
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">没有匹配结果</p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label="搜索结果">
              {results.map((result, index) => (
                <li
                  id={`${optionId}-${index}`}
                  key={`${result.entityType}-${result.entityId}`}
                  role="option"
                  aria-label={result.title}
                  aria-selected={selectedIndex === index}
                  className={`cursor-pointer rounded-[var(--radius-control)] px-3 py-2.5 ${
                    selectedIndex === index ? "bg-primary/8 text-foreground" : "text-muted-foreground"
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openResult(result);
                  }}
                >
                  <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs">{result.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

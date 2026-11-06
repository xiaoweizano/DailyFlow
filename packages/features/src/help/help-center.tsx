import { BookOpenText, Languages, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  helpPages,
  resolveHelpPageId,
  type HelpLocale,
  type HelpPage,
  type HelpPageId,
} from "./help-content.js";

function isAuthorizedExternalHref(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      (url.pathname === "/xiaoweizano/DailyFlow" ||
        url.pathname.startsWith("/xiaoweizano/DailyFlow/"))
    );
  } catch {
    return false;
  }
}

function renderLinkedText(value: string, keyPrefix: string): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/gu;
  const parts = value.split(tokenPattern).filter((part) => part.length > 0);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(part);
    if (link === null) {
      return <Fragment key={key}>{part}</Fragment>;
    }

    const label = link[1] ?? "";
    const href = link[2] ?? "";
    if (href.startsWith("/") && !href.startsWith("//")) {
      return (
        <Link key={key} to={href}>
          {label}
        </Link>
      );
    }
    if (isAuthorizedExternalHref(href)) {
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }
    return <Fragment key={key}>{label}</Fragment>;
  });
}

function renderLine(line: string, key: string): ReactNode {
  const heading = /^(#{1,4})\s+(.+)$/u.exec(line);
  if (heading !== null) {
    const level = heading[1]?.length ?? 1;
    const content = renderLinkedText(heading[2] ?? "", `${key}-heading`);
    if (level === 1) {
      return <h2 key={key}>{content}</h2>;
    }
    if (level === 2) {
      return <h3 key={key}>{content}</h3>;
    }
    return <h4 key={key}>{content}</h4>;
  }

  const unordered = /^[-*]\s+(.+)$/u.exec(line);
  if (unordered !== null) {
    return (
      <ul key={key}>
        <li>{renderLinkedText(unordered[1] ?? "", `${key}-item`)}</li>
      </ul>
    );
  }

  const ordered = /^\d+\.\s+(.+)$/u.exec(line);
  if (ordered !== null) {
    return (
      <ol key={key}>
        <li>{renderLinkedText(ordered[1] ?? "", `${key}-item`)}</li>
      </ol>
    );
  }

  const quote = /^>\s+(.+)$/u.exec(line);
  if (quote !== null) {
    return <blockquote key={key}>{renderLinkedText(quote[1] ?? "", `${key}-quote`)}</blockquote>;
  }

  return <p key={key}>{renderLinkedText(line, `${key}-paragraph`)}</p>;
}

export interface SafeMarkdownProps {
  readonly children: string;
}

export function SafeMarkdown({ children }: SafeMarkdownProps): React.JSX.Element {
  const blocks = useMemo(() => {
    const lines = children.split(/\r?\n/u);
    const rendered: ReactNode[] = [];
    let codeLines: string[] | null = null;

    for (const [index, line] of lines.entries()) {
      if (line.startsWith("```")) {
        if (codeLines === null) {
          codeLines = [];
          continue;
        }
        rendered.push(
          <pre key={`code-${index}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = null;
        continue;
      }

      if (codeLines !== null) {
        codeLines.push(line);
        continue;
      }
      if (line.trim() === "") {
        continue;
      }
      rendered.push(renderLine(line, `line-${index}`));
    }

    if (codeLines !== null) {
      rendered.push(
        <pre key="code-unclosed">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
    }
    return rendered;
  }, [children]);

  return <div className="df-safe-markdown">{blocks}</div>;
}

function pageMatches(page: HelpPage, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    normalized.length === 0 ||
    `${page.title}\n${page.description}\n${page.content}`.toLocaleLowerCase().includes(normalized)
  );
}

export function HelpCenter(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const routePageId = resolveHelpPageId(location.pathname.split("/").filter(Boolean).at(1));
  const [locale, setLocale] = useState<HelpLocale>("zh-CN");
  const [pageId, setPageId] = useState<HelpPageId>(routePageId);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setPageId(resolveHelpPageId(location.pathname.split("/").filter(Boolean).at(1)));
  }, [location.pathname]);

  const pages = helpPages[locale];
  const selectedPage = pages.find((page) => page.id === pageId) ?? pages[0];
  const visiblePages = pages.filter((page) => pageMatches(page, query));
  const labels =
    locale === "zh-CN"
      ? {
          title: "DailyFlow 帮助中心",
          description: "离线操作手册，覆盖日常记录、检索、分析和数据安全。",
          search: "搜索帮助",
          directory: "帮助目录",
        }
      : {
          title: "DailyFlow Help Center",
          description: "An offline guide for daily capture, retrieval, analysis, and data safety.",
          search: "Search help",
          directory: "Help contents",
        };

  function openPage(id: HelpPageId): void {
    setPageId(id);
    navigate(`/help/${id}`);
  }

  return (
    <div className="min-h-full bg-surface-muted/30 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase text-primary">
              <BookOpenText aria-hidden="true" className="size-3.5" />
              Offline manual
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{labels.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {labels.description}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 border border-border-strong bg-surface px-3 text-xs font-medium text-foreground hover:border-primary/40"
            onClick={() => setLocale((current) => (current === "zh-CN" ? "en-US" : "zh-CN"))}
          >
            <Languages aria-hidden="true" className="size-4" />
            English
          </button>
        </div>
      </header>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border border-border bg-surface p-3">
          <label htmlFor="help-search" className="sr-only">
            {labels.search}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="help-search"
              type="search"
              aria-label={labels.search}
              value={query}
              placeholder={labels.search}
              className="h-9 w-full border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <nav aria-label={labels.directory} className="mt-3 grid gap-1">
            {visiblePages.map((page) => (
              <button
                key={page.id}
                type="button"
                aria-current={page.id === pageId ? "page" : undefined}
                className={[
                  "border px-3 py-2 text-left",
                  page.id === pageId
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-transparent text-foreground hover:bg-surface-muted",
                ].join(" ")}
                onClick={() => openPage(page.id)}
              >
                <span className="block text-sm font-medium">{page.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {page.description}
                </span>
              </button>
            ))}
            {visiblePages.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">没有匹配的帮助内容。</p>
            ) : null}
          </nav>
        </aside>

        <article className="min-w-0 border border-border bg-surface p-5 sm:p-7">
          {selectedPage === undefined ? null : <SafeMarkdown>{selectedPage.content}</SafeMarkdown>}
        </article>
      </div>
    </div>
  );
}

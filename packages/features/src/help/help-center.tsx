import { ArrowUp, BookOpenText, ChevronDown, ListTree, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  helpManuals,
  helpSections,
  resolveHelpPageId,
  type HelpPageId,
  type HelpSection,
} from "./help-content.js";
import { getAppMessages } from "../preferences/app-messages.js";
import { useOptionalAppMessages } from "../preferences/use-app-messages.js";

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
    if (href.startsWith("#")) {
      return (
        <a key={key} href={href}>
          {label}
        </a>
      );
    }
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
  const heading = /^(#{1,4})\s+(.+?)(?:\s+\{#([^}]+)\})?$/u.exec(line);
  if (heading !== null) {
    const level = heading[1]?.length ?? 1;
    const content = renderLinkedText(heading[2] ?? "", `${key}-heading`);
    const id = heading[3] ?? key;
    if (level === 1) {
      return (
        <h2 key={key} id={id}>
          {content}
        </h2>
      );
    }
    if (level === 2) {
      return (
        <h3 key={key} id={id}>
          {content}
        </h3>
      );
    }
    return (
      <h4 key={key} id={id}>
        {content}
      </h4>
    );
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
    let index = 0;

    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (line.startsWith("```")) {
        if (codeLines === null) {
          codeLines = [];
          index += 1;
          continue;
        }
        rendered.push(
          <pre key={`code-${index}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = null;
        index += 1;
        continue;
      }

      if (codeLines !== null) {
        codeLines.push(line);
        index += 1;
        continue;
      }
      if (line.trim() === "") {
        index += 1;
        continue;
      }

      const unordered = /^[-*]\s+(.+)$/u.exec(line);
      if (unordered !== null) {
        const items: string[] = [];
        while (index < lines.length) {
          const item = /^[-*]\s+(.+)$/u.exec(lines[index] ?? "");
          if (item === null) {
            break;
          }
          items.push(item[1] ?? "");
          index += 1;

          let nextIndex = index;
          while ((lines[nextIndex] ?? "").trim() === "") {
            nextIndex += 1;
          }
          if (/^[-*]\s+(.+)$/u.test(lines[nextIndex] ?? "")) {
            index = nextIndex;
          }
        }
        rendered.push(
          <ul key={`list-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={`list-${index}-${itemIndex}`}>
                {renderLinkedText(item, `list-${index}-${itemIndex}`)}
              </li>
            ))}
          </ul>,
        );
        continue;
      }

      const ordered = /^\d+\.\s+(.+)$/u.exec(line);
      if (ordered !== null) {
        const items: string[] = [];
        while (index < lines.length) {
          const item = /^\d+\.\s+(.+)$/u.exec(lines[index] ?? "");
          if (item === null) {
            break;
          }
          items.push(item[1] ?? "");
          index += 1;

          let nextIndex = index;
          while ((lines[nextIndex] ?? "").trim() === "") {
            nextIndex += 1;
          }
          if (/^\d+\.\s+(.+)$/u.test(lines[nextIndex] ?? "")) {
            index = nextIndex;
          }
        }
        rendered.push(
          <ol key={`ordered-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={`ordered-${index}-${itemIndex}`}>
                {renderLinkedText(item, `ordered-${index}-${itemIndex}`)}
              </li>
            ))}
          </ol>,
        );
        continue;
      }

      rendered.push(renderLine(line, `line-${index}`));
      index += 1;
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

function sectionMatches(section: HelpSection, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    normalized.length === 0 ||
    `${section.title}\n${section.content}`.toLocaleLowerCase().includes(normalized)
  );
}

function routeSectionId(pathname: string): HelpPageId {
  return resolveHelpPageId(pathname.split("/").filter(Boolean).at(1));
}

export function HelpCenter(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const runtime = useOptionalAppMessages();
  const locale = runtime?.locale ?? "zh-CN";
  const labels = (runtime?.messages ?? getAppMessages(locale)).help;
  const [activeSection, setActiveSection] = useState<HelpPageId>(routeSectionId(location.pathname));
  const [query, setQuery] = useState("");
  const [mobileContentsOpen, setMobileContentsOpen] = useState(false);
  const sections = helpSections[locale];
  const visibleSections = sections.filter((section) => sectionMatches(section, query));

  useEffect(() => {
    const sectionParameter = location.pathname.split("/").filter(Boolean).at(1);
    const sectionId = routeSectionId(location.pathname);
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      const target =
        sectionParameter === undefined ? containerRef.current : document.getElementById(sectionId);
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({ block: "start" });
      }
    });
  }, [location.pathname]);

  function openSection(id: HelpPageId): void {
    setActiveSection(id);
    navigate(`/help/${id}`, { replace: true });
  }

  return (
    <div ref={containerRef} className="min-h-full bg-surface-muted/30 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase text-primary">
          <BookOpenText aria-hidden="true" className="size-3.5" />
          {labels.eyebrow}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{labels.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {labels.description}
            </p>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {labels.sectionCount(sections.length)}
          </span>
        </div>
      </header>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border border-border bg-surface lg:sticky lg:top-5 lg:p-3">
          <button
            type="button"
            aria-controls="help-directory"
            aria-expanded={mobileContentsOpen}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-foreground lg:hidden"
            onClick={() => setMobileContentsOpen((open) => !open)}
          >
            <span className="flex items-center gap-2">
              <ListTree aria-hidden="true" className="size-4 text-primary" />
              {labels.contents}
            </span>
            <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              {labels.sectionCount(sections.length)}
              <ChevronDown
                aria-hidden="true"
                className={`size-4 transition-transform ${mobileContentsOpen ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          <div
            id="help-directory"
            className={`${mobileContentsOpen ? "block" : "hidden"} border-t border-border p-3 lg:block lg:border-0 lg:p-0`}
          >
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
            <nav aria-label={labels.contents} className="mt-3 grid gap-1">
              {visibleSections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  aria-current={section.id === activeSection ? "location" : undefined}
                  className={[
                    "flex items-center gap-2 border px-3 py-2 text-left text-sm",
                    section.id === activeSection
                      ? "border-primary/30 bg-primary/5 font-medium text-primary"
                      : "border-transparent text-foreground hover:bg-surface-muted",
                  ].join(" ")}
                  onClick={() => {
                    setMobileContentsOpen(false);
                    openSection(section.id);
                  }}
                >
                  <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{section.title}</span>
                </button>
              ))}
              {visibleSections.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">{labels.noResults}</p>
              ) : null}
            </nav>
            <a
              href="#manual-top"
              className="mt-3 flex items-center gap-2 border-t border-border px-3 pt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowUp aria-hidden="true" className="size-3.5" />
              {labels.backToTop}
            </a>
          </div>
        </aside>

        <article
          id="manual-top"
          className="df-help-manual min-w-0 border border-border bg-surface p-5 sm:p-8"
        >
          <SafeMarkdown>{helpManuals[locale]}</SafeMarkdown>
        </article>
      </div>
    </div>
  );
}

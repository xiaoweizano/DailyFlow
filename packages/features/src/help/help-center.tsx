import {
  ArrowLeft,
  ArrowUpRight,
  BookOpenText,
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  Clock3,
  Database,
  FileText,
  Maximize2,
  Search,
  Settings2,
  Wrench,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@dailyflow/ui";

import {
  getHelpChapterHeadings,
  getHelpSection,
  getHelpTopic,
  helpInterface,
  helpManuals,
  helpSections,
  helpTopics,
  prepareHelpChapterMarkdown,
  resolveOptionalHelpPageId,
  searchHelp,
  type HelpPageId,
  type HelpTopic,
  type HelpTopicGroup,
} from "./help-content.js";
import { useOptionalAppMessages } from "../preferences/use-app-messages.js";

const helpAssetModules = import.meta.glob("./assets/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const topicGroups: readonly {
  readonly id: HelpTopicGroup;
  readonly icon: typeof BookOpenText;
}[] = [
  { id: "start", icon: BookOpenText },
  { id: "journal", icon: FileText },
  { id: "tasks", icon: CheckSquare2 },
  { id: "timeline", icon: CalendarDays },
  { id: "knowledge", icon: Database },
  { id: "data-settings", icon: Settings2 },
];

function resolveHelpAsset(file: string): string | undefined {
  return helpAssetModules[`./assets/${file}`];
}

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

function groupLabel(group: HelpTopicGroup, locale: "zh-CN" | "en-US"): string {
  const labels = helpInterface[locale];
  switch (group) {
    case "start":
      return labels.startTopic;
    case "journal":
      return labels.journal;
    case "tasks":
      return labels.tasks;
    case "timeline":
      return labels.timeline;
    case "knowledge":
      return labels.knowledge;
    case "data-settings":
      return labels.dataSettings;
  }
}

function TopicCard({
  topic,
  onOpen,
}: {
  readonly topic: HelpTopic;
  readonly onOpen: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="df-help-topic-card group flex min-h-40 flex-col border border-border bg-surface p-5 text-left"
      onClick={onOpen}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase text-primary">
          {String(topic.stepCount).padStart(2, "0")} steps
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </span>
      <span className="mt-5 block text-base font-semibold leading-6 text-foreground">
        {topic.title}
      </span>
      <span className="mt-2 block text-sm leading-6 text-muted-foreground">{topic.summary}</span>
    </button>
  );
}

function HelpHeader({
  locale,
  query,
  onQueryChange,
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
}): React.JSX.Element {
  const labels = helpInterface[locale];
  return (
    <header className="df-help-hero border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
          <BookOpenText aria-hidden="true" className="size-3.5" />
          {labels.eyebrow}
        </p>
        <span className="border border-border bg-surface px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          {locale === "zh-CN" ? "简体中文" : "English"}
        </span>
      </div>
      <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-foreground">{labels.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {labels.description}
          </p>
        </div>
        <div>
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
              placeholder={labels.searchHint}
              className="h-11 w-full border border-border-strong bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-primary"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function HelpLanding({
  locale,
  query,
  onQueryChange,
  onOpenTopic,
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onOpenTopic: (id: HelpPageId) => void;
}): React.JSX.Element {
  const labels = helpInterface[locale];
  const topics = helpTopics[locale];
  const results = searchHelp(locale, query);

  return (
    <div className="df-help-page-enter mx-auto w-full max-w-[88rem] px-4 py-5 sm:px-6 sm:py-7">
      <HelpHeader locale={locale} query={query} onQueryChange={onQueryChange} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {query.trim().length > 0 ? labels.searchResults(results.length) : labels.allTopics}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {query.trim().length > 0 ? labels.searchHint : labels.description}
          </p>
        </div>
        <Link
          to="/help/manual"
          className="inline-flex h-9 items-center gap-2 border border-border-strong bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/45 hover:text-primary"
        >
          <BookOpenText aria-hidden="true" className="size-3.5" />
          {labels.fullManual}
        </Link>
      </div>

      {query.trim().length > 0 ? (
        results.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {results.map((section) => {
              const topic = getHelpTopic(locale, section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  className="df-help-result group flex items-center justify-between gap-4 border border-border bg-surface px-4 py-4 text-left transition-colors hover:border-primary/40"
                  onClick={() => onOpenTopic(section.id)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {topic?.title ?? section.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {topic?.summary ?? section.title}
                    </span>
                  </span>
                  <ChevronLeft
                    aria-hidden="true"
                    className="size-4 shrink-0 rotate-180 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
            <Search aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">{labels.noResults}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.noResultsHint}</p>
          </div>
        )
      ) : (
        <div className="mt-5 grid gap-7">
          {topicGroups.map((group) => {
            const groupTopics = topics.filter((topic) => topic.group === group.id);
            if (groupTopics.length === 0) {
              return null;
            }
            const Icon = group.icon;
            return (
              <section key={group.id} aria-labelledby={`help-group-${group.id}`}>
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <Icon aria-hidden="true" className="size-4 text-primary" />
                  <h2
                    id={`help-group-${group.id}`}
                    className="text-sm font-semibold text-foreground"
                  >
                    {groupLabel(group.id, locale)}
                  </h2>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(groupTopics.length).padStart(2, "0")}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupTopics.map((topic) => (
                    <TopicCard key={topic.id} topic={topic} onOpen={() => onOpenTopic(topic.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HelpImage({
  locale,
  topic,
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly topic: HelpTopic;
}): React.JSX.Element {
  const src = resolveHelpAsset(topic.image.file);
  const enlargeLabel = locale === "zh-CN" ? "放大查看截图" : "View screenshot larger";
  return (
    <figure className="border border-border bg-surface p-2">
      {src === undefined ? (
        <div className="grid aspect-[16/10] place-items-center bg-surface-muted text-xs text-muted-foreground">
          {helpInterface[locale].noResults}
        </div>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={enlargeLabel}
              className="group relative block w-full overflow-hidden border border-border bg-surface-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={src}
                alt={topic.image.alt}
                className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
              />
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 grid size-8 place-items-center border border-white/60 bg-foreground/55 text-white opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <Maximize2 className="size-4" />
              </span>
            </button>
          </DialogTrigger>
          <DialogContent
            scroll="none"
            className="w-[min(96vw,1440px)] max-w-none grid-rows-[auto_minmax(0,1fr)] p-2 sm:p-3"
          >
            <DialogTitle className="sr-only">{topic.image.alt}</DialogTitle>
            <DialogDescription className="sr-only">{topic.image.caption}</DialogDescription>
            <img src={src} alt="" className="max-h-[82vh] w-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
      <figcaption className="px-2 pb-2 pt-3 text-xs leading-5 text-muted-foreground">
        {topic.image.caption}
      </figcaption>
    </figure>
  );
}

function HelpChapter({
  locale,
  id,
  onBack,
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly id: HelpPageId;
  readonly onBack: () => void;
}): React.JSX.Element {
  const labels = helpInterface[locale];
  const topic = getHelpTopic(locale, id) ?? helpTopics[locale][0];
  const section = getHelpSection(locale, id) ?? helpSections[locale][0];
  if (topic === undefined || section === undefined) {
    return (
      <HelpLanding locale={locale} query="" onQueryChange={() => undefined} onOpenTopic={onBack} />
    );
  }

  const headings = getHelpChapterHeadings(section);
  return (
    <div className="df-help-page-enter mx-auto w-full max-w-[92rem] px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {labels.backToCenter}
        </button>
        <Link
          to="/help/manual"
          className="inline-flex h-9 items-center gap-2 border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <BookOpenText aria-hidden="true" className="size-3.5" />
          {labels.fullManual}
        </Link>
      </div>

      <header className="grid gap-3 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
            {groupLabel(topic.group, locale)}
          </p>
          <h1 className="mt-2 max-w-4xl text-3xl font-semibold leading-tight text-foreground">
            {section.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{topic.summary}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock3 aria-hidden="true" className="size-3" />
            {labels.steps(topic.stepCount)}
          </span>
          <span>{labels.updated(topic.updatedAt)}</span>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
        <nav
          aria-label={labels.chapterContents}
          className="border border-border bg-surface p-4 lg:sticky lg:top-5"
        >
          <p className="flex items-center gap-2 border-b border-border pb-3 text-xs font-semibold text-foreground">
            <BookOpenText aria-hidden="true" className="size-3.5 text-primary" />
            {labels.chapterContents}
          </p>
          <div className="mt-2 grid gap-1">
            {headings.map((heading, index) => (
              <a
                key={heading.id}
                href={`#${heading.id}`}
                className="grid grid-cols-[1.4rem_minmax(0,1fr)] gap-1 py-1.5 text-xs leading-5 text-muted-foreground transition-colors hover:text-primary"
              >
                <span className="font-mono text-[9px] text-muted-foreground/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{heading.title}</span>
              </a>
            ))}
          </div>
        </nav>

        <article className="df-help-manual min-w-0 border border-border bg-surface p-5 sm:p-8">
          <SafeMarkdown>{prepareHelpChapterMarkdown(section)}</SafeMarkdown>
        </article>

        <aside className="lg:sticky lg:top-5">
          <HelpImage locale={locale} topic={topic} />
          <div className="mt-3 border border-border bg-surface p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Wrench aria-hidden="true" className="size-3.5 text-primary" />
              {locale === "zh-CN" ? "恢复提示" : "Recovery check"}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {locale === "zh-CN"
                ? "操作没有达到预期时，先保留当前输入，再核对字段提示、保存状态和当前日期。"
                : "If the result is unexpected, keep your input, then check field errors, save state, and the selected date."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FullManual({
  locale,
  onBack,
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly onBack: () => void;
}): React.JSX.Element {
  const labels = helpInterface[locale];
  return (
    <div className="df-help-page-enter mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {labels.backToCenter}
        </button>
        <span className="font-mono text-[10px] text-muted-foreground">{labels.fullManual}</span>
      </div>
      <article className="df-help-manual mt-5 border border-border bg-surface p-5 sm:p-9">
        <SafeMarkdown>{helpManuals[locale]}</SafeMarkdown>
      </article>
    </div>
  );
}

export function HelpCenter(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const runtime = useOptionalAppMessages();
  const locale = runtime?.locale ?? "zh-CN";
  const [query, setQuery] = useState("");
  const routeSegment = location.pathname.split("/").filter(Boolean).at(1);
  const chapterId = resolveOptionalHelpPageId(routeSegment);
  const isManual = routeSegment === "manual";

  useEffect(() => {
    if (chapterId === null && !isManual) {
      setQuery("");
    }
  }, [chapterId, isManual]);

  function openTopic(id: HelpPageId): void {
    navigate(`/help/${id}`);
  }

  if (isManual) {
    return (
      <div className="min-h-full bg-surface-muted/35">
        <FullManual locale={locale} onBack={() => navigate("/help")} />
      </div>
    );
  }

  if (chapterId !== null) {
    return (
      <div className="min-h-full bg-surface-muted/35">
        <HelpChapter locale={locale} id={chapterId} onBack={() => navigate("/help")} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface-muted/35">
      <HelpLanding locale={locale} query={query} onQueryChange={setQuery} onOpenTopic={openTopic} />
    </div>
  );
}

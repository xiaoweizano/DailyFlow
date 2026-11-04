import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  Database,
  LayoutDashboard,
  LibraryBig,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import { Input, SaveStatus } from "@dailyflow/ui";

import { appModules, type AppModuleId, type AppRouteOptions } from "./app-modules.js";
import { createCommandRegistry, detectShortcutPlatform } from "./platform/command-registry.js";
import { SearchCommand } from "./search/search-command.js";

export type AppShellProps = AppRouteOptions;

const navIcons: Record<AppModuleId, LucideIcon> = {
  dashboard: LayoutDashboard,
  journal: BookOpenText,
  timeline: CalendarDays,
  knowledge: LibraryBig,
  tasks: CheckSquare2,
  search: Search,
  analytics: BarChart3,
  data: Database,
};

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function navDestination(moduleId: AppModuleId): string {
  if (moduleId === "journal") {
    return `/journal/${currentLocalDate()}`;
  }

  const module = appModules.find((item) => item.id === moduleId);
  return module?.path ?? "/";
}

function resolveCurrentModule(pathname: string): (typeof appModules)[number] | undefined {
  if (pathname === "/") {
    return appModules[0];
  }

  return appModules.find((module) => module.path !== "/" && pathname.startsWith(module.path));
}

export function AppShell({ platform, storageLabel, version }: AppShellProps): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const currentModule = resolveCurrentModule(location.pathname);
  const isSettings = location.pathname === "/settings";
  const currentLabel = isSettings ? "设置" : (currentModule?.label ?? "DailyFlow");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const registry = createCommandRegistry({
      platform: detectShortcutPlatform(),
    });

    function handleShortcut(event: KeyboardEvent): void {
      const resolved = registry.resolve(event);
      if (resolved === null) {
        return;
      }

      switch (resolved.definition.id) {
        case "global-search":
          setSearchOpen(true);
          break;
        case "open-settings":
          navigate("/settings");
          break;
        case "shortcut-help":
          navigate("/settings#shortcut-help");
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [navigate]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("q") ?? "").trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
  }

  return (
    <div className="df-shell">
      <a
        href="#main-workspace"
        className="sr-only fixed left-3 top-3 z-[100] rounded-[var(--radius-control)] bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only"
      >
        跳到主要内容
      </a>

      <aside className="df-sidebar">
        <div className="flex h-[var(--topbar-height)] items-center border-b border-border px-4 max-[899px]:justify-center max-[899px]:px-2">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] text-foreground"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-primary text-[12px] font-bold text-primary-foreground shadow-sm"
            >
              DF
            </span>
            <span className="df-brand-copy min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-5 tracking-normal">
                DailyFlow
              </span>
              <span className="block truncate font-mono text-[10px] uppercase leading-3 text-muted-foreground">
                local workspace
              </span>
            </span>
          </Link>
        </div>

        <nav aria-label="主导航" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
          <p className="df-nav-section-label mb-2 px-2 font-mono text-[10px] uppercase text-muted-foreground">
            Workspace
          </p>
          <ul className="grid gap-1">
            {appModules.map((module) => {
              const Icon = navIcons[module.id];

              return (
                <li key={module.id}>
                  <NavLink
                    to={navDestination(module.id)}
                    end={module.id === "dashboard"}
                    title={module.label}
                    className={({ isActive }) =>
                      [
                        "df-nav-link flex h-9 min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] border px-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "border-border-strong bg-surface text-primary shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-surface/75 hover:text-foreground",
                      ].join(" ")
                    }
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
                    <span className="df-nav-copy truncate">{module.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-2">
          <NavLink
            to="/settings"
            title="设置"
            className={({ isActive }) =>
              [
                "df-nav-link flex h-9 min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] border px-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-border-strong bg-surface text-primary shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-surface/75 hover:text-foreground",
              ].join(" ")
            }
          >
            <Settings aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
            <span className="df-nav-copy truncate">设置</span>
          </NavLink>
          <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-xs text-muted-foreground max-[899px]:justify-center">
            <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
            <span className="df-sidebar-footer-copy truncate">{storageLabel}</span>
          </div>
        </div>
      </aside>

      <div className="df-main">
        <header className="flex min-w-0 items-center gap-3 border-b border-border bg-surface/95 px-4 max-[719px]:px-3">
          <nav aria-label="面包屑" className="flex min-w-0 shrink-0 items-center gap-1.5">
            <Link
              to="/"
              className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
            >
              DailyFlow
            </Link>
            <ChevronRight
              aria-hidden="true"
              className="hidden size-3.5 text-border-strong sm:block"
            />
            <span className="max-w-28 truncate text-xs font-semibold text-foreground sm:max-w-44">
              {currentLabel}
            </span>
          </nav>

          <span className="df-topbar-divider h-4 w-px shrink-0 bg-border" aria-hidden="true" />

          <form
            role="search"
            onSubmit={handleSearch}
            className="df-topbar-search min-w-0 flex-1 max-w-xl"
          >
            <label htmlFor="global-search" className="sr-only">
              搜索日志、知识和任务
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="global-search"
                name="q"
                placeholder="搜索日志、知识和任务"
                className="h-8 bg-surface-muted pl-9 pr-10 shadow-none max-[719px]:pl-3"
              />
              <span
                aria-hidden="true"
                className="df-topbar-shortcut pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                /
              </span>
            </div>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <SaveStatus status="idle" />
            <span className="hidden h-4 w-px bg-border xl:block" aria-hidden="true" />
            <Link
              to={params.date ? `/journal/${params.date}` : navDestination("journal")}
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary-hover max-[719px]:hidden"
            >
              打开今日日志
            </Link>
          </div>
        </header>

        <main id="main-workspace" className="df-workspace" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <footer className="df-statusbar">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
          <span className="truncate">
            {platform === "desktop" ? "桌面端" : "Web"} · {storageLabel}
          </span>
        </div>
        <div className="df-statusbar-secondary flex shrink-0 items-center gap-3 font-mono">
          <span>v{version}</span>
          <span>本地优先</span>
        </div>
      </footer>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

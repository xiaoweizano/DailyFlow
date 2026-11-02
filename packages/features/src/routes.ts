import { createElement } from "react";
import type { RouteObject } from "react-router-dom";

import { AppServicesProvider } from "./app-services-provider.js";
import { AppShell } from "./app-shell.js";
import type { AppRouteOptions } from "./app-modules.js";
import { DashboardPage } from "./dashboard/dashboard-page.js";
import { JournalPage } from "./journal/journal-page.js";
import { KnowledgeDetailPage } from "./knowledge/knowledge-detail.js";
import { KnowledgePage } from "./knowledge/knowledge-page.js";
import { ModulePage, NotFoundPage } from "./module-page.js";
import { SearchPage } from "./search/search-page.js";
import { TasksPage } from "./tasks/tasks-page.js";
import { TimelinePage } from "./timeline/timeline-page.js";

export {
  appModules,
  mainNavigation,
  routePaths,
  type AppModule,
  type AppModuleId,
  type AppRouteOptions,
} from "./app-modules.js";

export function createAppRoutes(options: AppRouteOptions): RouteObject[] {
  const { services, ...shellOptions } = options;
  const shell =
    services === undefined
      ? createElement(AppShell, shellOptions)
      : createElement(AppServicesProvider, {
          services,
          children: createElement(AppShell, shellOptions),
        });

  return [
    {
      path: "/",
      element: shell,
      children: [
        {
          index: true,
          element: createElement(DashboardPage),
        },
        {
          path: "journal/:date",
          element: createElement(JournalPage),
        },
        {
          path: "timeline",
          element: createElement(TimelinePage),
        },
        {
          path: "timeline/:date",
          element: createElement(TimelinePage),
        },
        {
          path: "knowledge",
          element: createElement(KnowledgePage),
        },
        {
          path: "knowledge/:id",
          element: createElement(KnowledgeDetailPage),
        },
        {
          path: "tasks",
          element: createElement(TasksPage),
        },
        {
          path: "search",
          element: createElement(SearchPage),
        },
        {
          path: "analytics",
          element: createElement(ModulePage, { moduleId: "analytics" }),
        },
        {
          path: "analytics/:periodType/:start",
          element: createElement(ModulePage, { moduleId: "analytics" }),
        },
        {
          path: "data",
          element: createElement(ModulePage, { moduleId: "data" }),
        },
        {
          path: "settings",
          element: createElement(ModulePage, { moduleId: "settings" }),
        },
        {
          path: "*",
          element: createElement(NotFoundPage),
        },
      ],
    },
  ];
}

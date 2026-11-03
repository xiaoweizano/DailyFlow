import { createElement } from "react";
import type { RouteObject } from "react-router-dom";

import { AppServicesProvider } from "./app-services-provider.js";
import { AppShell } from "./app-shell.js";
import type { AppRouteOptions } from "./app-modules.js";
import { AnalyticsPage } from "./analytics/analytics-page.js";
import { BackupPage } from "./data-management/backup-page.js";
import { ExportPage } from "./data-management/export-page.js";
import { ImportPage } from "./data-management/import-page.js";
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
          element: createElement(AnalyticsPage),
        },
        {
          path: "analytics/:periodType/:start",
          element: createElement(AnalyticsPage),
        },
        {
          path: "data",
          element: createElement(ModulePage, { moduleId: "data" }),
        },
        {
          path: "data/import",
          element: createElement(ImportPage),
        },
        {
          path: "data/export",
          element: createElement(ExportPage),
        },
        {
          path: "data/backup",
          element: createElement(BackupPage),
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

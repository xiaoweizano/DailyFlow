import { createElement } from "react";
import type { RouteObject } from "react-router-dom";

import { AppShell } from "./app-shell.js";
import type { AppRouteOptions } from "./app-modules.js";
import { ModulePage, NotFoundPage } from "./module-page.js";

export {
  appModules,
  mainNavigation,
  routePaths,
  type AppModule,
  type AppModuleId,
  type AppRouteOptions,
} from "./app-modules.js";

export function createAppRoutes(options: AppRouteOptions): RouteObject[] {
  return [
    {
      path: "/",
      element: createElement(AppShell, options),
      children: [
        {
          index: true,
          element: createElement(ModulePage, { moduleId: "dashboard" }),
        },
        {
          path: "journal/:date",
          element: createElement(ModulePage, { moduleId: "journal" }),
        },
        {
          path: "timeline",
          element: createElement(ModulePage, { moduleId: "timeline" }),
        },
        {
          path: "timeline/:date",
          element: createElement(ModulePage, { moduleId: "timeline" }),
        },
        {
          path: "knowledge",
          element: createElement(ModulePage, { moduleId: "knowledge" }),
        },
        {
          path: "knowledge/:id",
          element: createElement(ModulePage, { moduleId: "knowledge" }),
        },
        {
          path: "tasks",
          element: createElement(ModulePage, { moduleId: "tasks" }),
        },
        {
          path: "search",
          element: createElement(ModulePage, { moduleId: "search" }),
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

import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appModules, createAppRoutes, mainNavigation, routePaths } from "../src/index.js";

const routes = createAppRoutes({
  platform: "web",
  storageLabel: "IndexedDB",
  version: "0.1.0",
});

describe("shared application routes", () => {
  it("exposes the eight primary modules and settings as secondary navigation", () => {
    expect(mainNavigation).toHaveLength(8);
    expect(mainNavigation.map((module) => module.id)).toEqual([
      "dashboard",
      "journal",
      "timeline",
      "knowledge",
      "tasks",
      "search",
      "analytics",
      "data",
    ]);
    expect(routePaths.settings).toBe("/settings");
    expect(appModules).toHaveLength(8);
  });

  it.each([
    "/",
    "/journal/2026-10-30",
    "/timeline",
    "/knowledge",
    "/tasks",
    "/search?q=WebView2",
    "/analytics",
    "/data",
    "/settings",
  ])("matches the shared route %s", (path) => {
    expect(matchRoutes(routes, path)).not.toBeNull();
  });

  it("falls back to a recoverable not-found page without leaving the app shell", () => {
    const matches = matchRoutes(routes, "/unknown");

    expect(matches).not.toBeNull();
    expect(matches?.at(-1)?.route.path).toBe("*");
  });
});

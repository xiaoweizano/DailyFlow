import { isValidElement } from "react";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appModules, createAppRoutes, mainNavigation, routePaths } from "../src/index.js";
import { AnalyticsPage } from "../src/analytics/analytics-page.js";
import { ExportPage } from "../src/data-management/export-page.js";
import { ImportPage } from "../src/data-management/import-page.js";
import { KnowledgeDetailPage } from "../src/knowledge/knowledge-detail.js";
import { KnowledgePage } from "../src/knowledge/knowledge-page.js";
import { SearchPage } from "../src/search/search-page.js";

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
    "/knowledge/0198e2f4-7e33-7c70-a8b2-18c1520f9c41",
    "/tasks",
    "/search?q=WebView2",
    "/analytics",
    "/analytics/month/2026-10-01",
    "/data",
    "/data/import",
    "/data/export",
    "/settings",
  ])("matches the shared route %s", (path) => {
    expect(matchRoutes(routes, path)).not.toBeNull();
  });

  it("falls back to a recoverable not-found page without leaving the app shell", () => {
    const matches = matchRoutes(routes, "/unknown");

    expect(matches).not.toBeNull();
    expect(matches?.at(-1)?.route.path).toBe("*");
  });

  it.each([
    ["/knowledge", KnowledgePage],
    ["/knowledge/0198e2f4-7e33-7c70-a8b2-18c1520f9c41", KnowledgeDetailPage],
    ["/search?q=WebView2", SearchPage],
    ["/analytics", AnalyticsPage],
    ["/analytics/month/2026-10-01", AnalyticsPage],
    ["/data/import", ImportPage],
    ["/data/export", ExportPage],
  ])("mounts the implemented page for %s", (path, page) => {
    const matches = matchRoutes(routes, path);
    const element = matches?.at(-1)?.route.element;

    expect(isValidElement(element)).toBe(true);
    expect(isValidElement(element) ? element.type : undefined).toBe(page);
  });
});

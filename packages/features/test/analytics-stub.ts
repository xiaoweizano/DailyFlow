import { vi } from "vitest";

import type { AnalyticsRuntimeServices } from "../src/analytics/analytics-services.js";

export function createAnalyticsServicesStub(
  overrides: Partial<AnalyticsRuntimeServices> = {},
): AnalyticsRuntimeServices {
  return {
    getSummary: vi.fn(async () => {
      throw new Error("Analytics not used in this test");
    }),
    getReport: vi.fn(async () => null),
    generateDraft: vi.fn(() => {
      throw new Error("Analytics not used in this test");
    }),
    saveReport: vi.fn(async () => {
      throw new Error("Analytics not used in this test");
    }),
    ...overrides,
  };
}

import { vi } from "vitest";

import type { ExportRuntimeServices } from "../src/data-management/export-services.js";

export function createExportServicesStub(
  overrides: Partial<ExportRuntimeServices> = {},
): ExportRuntimeServices {
  return {
    estimate: vi.fn(async () => {
      throw new Error("Export not used in this test");
    }),
    run: vi.fn(async () => {
      throw new Error("Export not used in this test");
    }),
    ...overrides,
  };
}

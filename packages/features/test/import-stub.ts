import type { ImportService } from "@dailyflow/application";
import { vi } from "vitest";

export function createImportServicesStub(): ImportService {
  return {
    selectRoot: vi.fn(async () => null),
    scan: vi.fn(async () =>
      (async function* () {
        yield* [];
      })(),
    ),
    createPreview: vi.fn(),
    commit: vi.fn(),
  };
}

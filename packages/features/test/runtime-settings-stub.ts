import { DEFAULT_USER_PREFERENCES } from "@dailyflow/application";

import type { AppRuntimeServices } from "../src/app-services-context.js";

export function createRuntimeSettingsStub(): Pick<AppRuntimeServices, "settings" | "ai"> {
  return {
    settings: {
      load: async () => ({
        preferences: DEFAULT_USER_PREFERENCES,
        warning: null,
      }),
      save: async () => ({
        preferences: DEFAULT_USER_PREFERENCES,
        persisted: true,
        warning: null,
      }),
    },
    ai: {
      providers: [],
      secretBackend: "session-memory",
      prepare: async () => {
        throw new Error("AI is not used in this test.");
      },
      run: async () => {
        throw new Error("AI is not used in this test.");
      },
    },
  };
}

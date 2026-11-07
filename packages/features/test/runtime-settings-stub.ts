import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@dailyflow/application";

import type { AppRuntimeServices } from "../src/app-services-context.js";

export function createRuntimeSettingsStub(
  overrides: Partial<UserPreferences> = {},
): Pick<AppRuntimeServices, "settings" | "ai"> {
  const preferences: UserPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    ...overrides,
  };

  return {
    settings: {
      load: async () => ({
        preferences,
        warning: null,
      }),
      save: async () => ({
        preferences,
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

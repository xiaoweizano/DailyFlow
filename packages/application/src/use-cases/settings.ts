import { z } from "zod";

import type { SettingsStore } from "../ports/settings-store.js";

export const SETTINGS_KEYS = {
  userPreferences: "user-preferences",
} as const;

export const ThemePreferenceSchema = z.enum(["light", "dark", "system"]);
export const DensityPreferenceSchema = z.enum(["comfortable", "compact"]);

export const HistoryRetentionSchema = z.object({
  maxVersions: z.number().int().min(10).max(1000).default(100),
  maxAgeDays: z.number().int().min(7).max(3650).default(180),
});

export const UserPreferencesSchema = z.object({
  theme: ThemePreferenceSchema.default("system"),
  density: DensityPreferenceSchema.default("comfortable"),
  autosaveIntervalMs: z.number().int().min(200).max(10_000).default(800),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  showWarnings: z.boolean().default(true),
  historyRetention: HistoryRetentionSchema.default({
    maxVersions: 100,
    maxAgeDays: 180,
  }),
});

export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;
export type DensityPreference = z.infer<typeof DensityPreferenceSchema>;
export type HistoryRetention = z.infer<typeof HistoryRetentionSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export type SettingsWarningCode =
  | "invalid_value"
  | "read_failed"
  | "write_failed";

export interface SettingsWarning {
  readonly code: SettingsWarningCode;
  readonly message: string;
}

export interface UserPreferencesLoadResult {
  readonly preferences: UserPreferences;
  readonly warning: SettingsWarning | null;
}

export interface UserPreferencesSaveResult {
  readonly preferences: UserPreferences;
  readonly persisted: boolean;
  readonly warning: SettingsWarning | null;
}

export interface UserPreferencesDependencies {
  readonly store: SettingsStore;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = Object.freeze({
  theme: "system",
  density: "comfortable",
  autosaveIntervalMs: 800,
  weekStartsOn: 1,
  showWarnings: true,
  historyRetention: Object.freeze({
    maxVersions: 100,
    maxAgeDays: 180,
  }),
});

const invalidValueWarning: SettingsWarning = {
  code: "invalid_value",
  message: "设置值无效，已使用默认设置。",
};

const readFailedWarning: SettingsWarning = {
  code: "read_failed",
  message: "无法读取设置，已使用默认设置。",
};

export async function loadUserPreferences({
  store,
}: UserPreferencesDependencies): Promise<UserPreferencesLoadResult> {
  try {
    const valueJson = await store.read(SETTINGS_KEYS.userPreferences);
    if (valueJson === null) {
      return {
        preferences: DEFAULT_USER_PREFERENCES,
        warning: null,
      };
    }

    let value: unknown;
    try {
      value = JSON.parse(valueJson) as unknown;
    } catch {
      return {
        preferences: DEFAULT_USER_PREFERENCES,
        warning: invalidValueWarning,
      };
    }

    const parsed = UserPreferencesSchema.safeParse(value);
    if (!parsed.success) {
      return {
        preferences: DEFAULT_USER_PREFERENCES,
        warning: invalidValueWarning,
      };
    }

    return {
      preferences: parsed.data,
      warning: null,
    };
  } catch {
    return {
      preferences: DEFAULT_USER_PREFERENCES,
      warning: readFailedWarning,
    };
  }
}

export async function saveUserPreferences(
  { store }: UserPreferencesDependencies,
  input: unknown,
): Promise<UserPreferencesSaveResult> {
  const parsed = UserPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      preferences: DEFAULT_USER_PREFERENCES,
      persisted: false,
      warning: {
        code: "invalid_value",
        message: "设置值无效，未保存更改。",
      },
    };
  }

  try {
    await store.write(SETTINGS_KEYS.userPreferences, JSON.stringify(parsed.data));
    return {
      preferences: parsed.data,
      persisted: true,
      warning: null,
    };
  } catch {
    return {
      preferences: parsed.data,
      persisted: false,
      warning: {
        code: "write_failed",
        message: "无法保存设置，请稍后重试。",
      },
    };
  }
}

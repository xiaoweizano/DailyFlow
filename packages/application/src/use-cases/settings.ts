import { z } from "zod";

import type { SettingsStore } from "../ports/settings-store.js";

export const SETTINGS_KEYS = {
  userPreferences: "user-preferences",
} as const;

export const LocalePreferenceSchema = z.enum(["zh-CN", "en-US"]);
export const ThemePreferenceSchema = z.enum(["light", "dark", "system"]);
export const AccentPreferenceSchema = z.enum(["blue", "green", "amber", "rose", "neutral"]);
export const DensityPreferenceSchema = z.enum(["comfortable", "compact", "spacious"]);
export const EditorWidthPreferenceSchema = z.enum(["focused", "wide"]);
export const CloseBehaviorSchema = z.enum(["ask", "minimize", "quit"]);

export const HistoryRetentionSchema = z.object({
  maxVersions: z.number().int().min(10).max(1000).default(100),
  maxAgeDays: z.number().int().min(7).max(3650).default(180),
});

const persistedPreferencesSchema = z
  .object({
    schemaVersion: z
      .union([z.literal(1), z.literal(2)])
      .transform(() => 2 as const)
      .default(2),
    locale: LocalePreferenceSchema.default("zh-CN"),
    theme: ThemePreferenceSchema.default("system"),
    accent: AccentPreferenceSchema.default("blue"),
    density: DensityPreferenceSchema.default("comfortable"),
    editorFontSize: z.number().int().min(13).max(20).default(15),
    editorWidth: EditorWidthPreferenceSchema.default("wide"),
    showOutline: z.boolean().default(true),
    autosaveIntervalMs: z.number().int().min(200).max(10_000).default(800),
    weekStartsOn: z.number().int().min(0).max(6).default(1),
    showWarnings: z.boolean().default(true),
    closeBehavior: CloseBehaviorSchema.default("ask"),
    autostart: z.boolean().default(false),
    silentStart: z.boolean().default(false),
    customDataDirectory: z.string().min(1).nullable().default(null),
    historyRetention: HistoryRetentionSchema.default({
      maxVersions: 100,
      maxAgeDays: 180,
    }),
  })
  .strip();

export const UserPreferencesSchema = z.preprocess((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const legacy = value as Record<string, unknown>;
  if ("closeBehavior" in legacy || typeof legacy.closeToTray !== "boolean") {
    return legacy;
  }

  const { closeToTray, ...preferences } = legacy;
  return {
    ...preferences,
    closeBehavior: closeToTray ? "minimize" : "ask",
  };
}, persistedPreferencesSchema);

export type LocalePreference = z.infer<typeof LocalePreferenceSchema>;
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;
export type AccentPreference = z.infer<typeof AccentPreferenceSchema>;
export type DensityPreference = z.infer<typeof DensityPreferenceSchema>;
export type EditorWidthPreference = z.infer<typeof EditorWidthPreferenceSchema>;
export type HistoryRetention = z.infer<typeof HistoryRetentionSchema>;
export type CloseBehavior = z.infer<typeof CloseBehaviorSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export type SettingsWarningCode = "invalid_value" | "read_failed" | "write_failed";

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
  schemaVersion: 2,
  locale: "zh-CN",
  theme: "system",
  accent: "blue",
  density: "comfortable",
  editorFontSize: 15,
  editorWidth: "wide",
  showOutline: true,
  autosaveIntervalMs: 800,
  weekStartsOn: 1,
  showWarnings: true,
  closeBehavior: "ask",
  autostart: false,
  silentStart: false,
  customDataDirectory: null,
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

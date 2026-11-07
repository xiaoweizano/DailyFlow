import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_USER_PREFERENCES,
  SETTINGS_KEYS,
  UserPreferencesSchema,
  loadUserPreferences,
  saveUserPreferences,
  type SettingsStore,
} from "../src/index.js";

function createStore(value: string | null = null): SettingsStore {
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async () => undefined),
  };
}

describe("user preference settings", () => {
  it("migrates legacy close-to-tray preferences to an explicit close behavior", () => {
    expect(
      UserPreferencesSchema.parse({ schemaVersion: 1, closeToTray: false }).closeBehavior,
    ).toBe("ask");
    expect(UserPreferencesSchema.parse({ schemaVersion: 1, closeToTray: true }).closeBehavior).toBe(
      "minimize",
    );
    expect(
      UserPreferencesSchema.parse({ schemaVersion: 2, closeBehavior: "minimize" }).closeBehavior,
    ).toBe("minimize");
    expect(DEFAULT_USER_PREFERENCES.closeBehavior).toBe("ask");
  });

  it("migrates legacy preferences without losing valid values", () => {
    const parsed = UserPreferencesSchema.parse({
      theme: "dark",
      density: "compact",
      autosaveIntervalMs: 1200,
    });

    expect(parsed).toMatchObject({
      schemaVersion: 2,
      theme: "dark",
      density: "compact",
      autosaveIntervalMs: 1200,
      locale: "zh-CN",
      closeBehavior: "ask",
      autostart: false,
      silentStart: false,
      customDataDirectory: null,
      accent: "blue",
      editorFontSize: 15,
      editorWidth: "wide",
      showOutline: true,
    });
  });

  it("uses defaults when no persisted preferences exist", async () => {
    const store = createStore();

    await expect(loadUserPreferences({ store })).resolves.toEqual({
      preferences: DEFAULT_USER_PREFERENCES,
      warning: null,
    });
    expect(store.read).toHaveBeenCalledWith(SETTINGS_KEYS.userPreferences);
  });

  it("loads a validated preference document", async () => {
    const store = createStore(
      JSON.stringify({
        theme: "dark",
        density: "compact",
        autosaveIntervalMs: 1200,
        weekStartsOn: 0,
        showWarnings: false,
        historyRetention: {
          maxVersions: 150,
          maxAgeDays: 365,
        },
      }),
    );

    await expect(loadUserPreferences({ store })).resolves.toMatchObject({
      warning: null,
      preferences: {
        theme: "dark",
        density: "compact",
        autosaveIntervalMs: 1200,
        weekStartsOn: 0,
        showWarnings: false,
        historyRetention: {
          maxVersions: 150,
          maxAgeDays: 365,
        },
      },
    });
  });

  it("falls back without throwing when persisted settings are invalid", async () => {
    const store = createStore(
      JSON.stringify({
        theme: "neon",
        autosaveIntervalMs: -1,
      }),
    );

    await expect(loadUserPreferences({ store })).resolves.toEqual({
      preferences: DEFAULT_USER_PREFERENCES,
      warning: {
        code: "invalid_value",
        message: "设置值无效，已使用默认设置。",
      },
    });
  });

  it("falls back without blocking startup when settings storage fails", async () => {
    const store: SettingsStore = {
      read: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      write: vi.fn(async () => undefined),
    };

    await expect(loadUserPreferences({ store })).resolves.toEqual({
      preferences: DEFAULT_USER_PREFERENCES,
      warning: {
        code: "read_failed",
        message: "无法读取设置，已使用默认设置。",
      },
    });
  });

  it("validates and persists the complete preference document", async () => {
    const store = createStore();
    const preferences = {
      ...DEFAULT_USER_PREFERENCES,
      theme: "light" as const,
      autosaveIntervalMs: 600,
    };

    await expect(saveUserPreferences({ store }, preferences)).resolves.toEqual({
      preferences,
      persisted: true,
      warning: null,
    });
    expect(store.write).toHaveBeenCalledWith(
      SETTINGS_KEYS.userPreferences,
      JSON.stringify(preferences),
    );
  });

  it("does not write invalid preferences", async () => {
    const store = createStore();

    await expect(
      saveUserPreferences(
        { store },
        {
          ...DEFAULT_USER_PREFERENCES,
          weekStartsOn: 9,
        },
      ),
    ).resolves.toEqual({
      preferences: DEFAULT_USER_PREFERENCES,
      persisted: false,
      warning: {
        code: "invalid_value",
        message: "设置值无效，未保存更改。",
      },
    });
    expect(store.write).not.toHaveBeenCalled();
  });
});

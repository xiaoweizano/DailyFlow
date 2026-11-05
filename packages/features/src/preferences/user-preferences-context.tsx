import {
  DEFAULT_USER_PREFERENCES,
  type SettingsWarning,
  type UserPreferences,
  type UserPreferencesSaveResult,
} from "@dailyflow/application";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import type { SettingsRuntimeServices } from "../app-services-context.js";
import { applyVisualPreferences } from "./apply-visual-preferences.js";
import { UserPreferencesContext, type UserPreferencesRuntime } from "./user-preferences-runtime.js";

export interface UserPreferencesProviderProps {
  readonly settings: SettingsRuntimeServices;
  readonly children: ReactNode;
}

export function UserPreferencesProvider({
  settings,
  children,
}: UserPreferencesProviderProps): React.JSX.Element {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [warning, setWarning] = useState<SettingsWarning | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void settings
      .load()
      .then((result) => {
        if (!active) {
          return;
        }
        setPreferences(result.preferences);
        setWarning(result.warning);
        void settings.applyRuntimePreferences?.(result.preferences).catch((error: unknown) => {
          console.error("DailyFlow runtime preferences could not be applied", error);
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setPreferences(DEFAULT_USER_PREFERENCES);
        setWarning({
          code: "read_failed",
          message: "无法读取设置，已使用默认设置。",
        });
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [settings]);

  useEffect(() => {
    applyVisualPreferences(preferences);
    if (preferences.theme !== "system" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (): void => {
      applyVisualPreferences(preferences);
    };
    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, [preferences]);

  const save = useCallback(
    async (input: unknown): Promise<UserPreferencesSaveResult> => {
      const result = await settings.save(input);
      if (result.persisted) {
        await settings.applyRuntimePreferences?.(result.preferences);
      }
      setPreferences(result.preferences);
      setWarning(result.warning);
      return result;
    },
    [settings],
  );

  const value = useMemo<UserPreferencesRuntime>(
    () => ({
      preferences,
      warning,
      loading,
      save,
    }),
    [loading, preferences, save, warning],
  );

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
}

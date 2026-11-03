import type {
  SettingsWarning,
  UserPreferences,
  UserPreferencesSaveResult,
} from "@dailyflow/application";
import { createContext } from "react";

export interface UserPreferencesRuntime {
  readonly preferences: UserPreferences;
  readonly warning: SettingsWarning | null;
  readonly loading: boolean;
  save(input: unknown): Promise<UserPreferencesSaveResult>;
}

export const UserPreferencesContext = createContext<UserPreferencesRuntime | null>(null);

import { useContext } from "react";

import { UserPreferencesContext, type UserPreferencesRuntime } from "./user-preferences-runtime.js";

export function useUserPreferences(): UserPreferencesRuntime {
  const value = useContext(UserPreferencesContext);
  if (value === null) {
    throw new Error("DailyFlow user preferences are not available");
  }
  return value;
}

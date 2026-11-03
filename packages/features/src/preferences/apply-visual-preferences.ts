import type { UserPreferences } from "@dailyflow/application";

export function applyVisualPreferences(preferences: UserPreferences): void {
  if (typeof document === "undefined") {
    return;
  }

  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const root = document.documentElement;
  root.dataset.theme =
    preferences.theme === "system" ? (prefersDark ? "dark" : "light") : preferences.theme;
  root.dataset.density = preferences.density;
}

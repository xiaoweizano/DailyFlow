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
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.style.setProperty("--editor-font-size", `${preferences.editorFontSize}px`);
  root.style.setProperty(
    "--editor-content-width",
    preferences.editorWidth === "wide" ? "min(100%, 96ch)" : "min(100%, 72ch)",
  );
}

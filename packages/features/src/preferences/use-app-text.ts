import { useCallback } from "react";

import type { SaveState } from "@dailyflow/ui";

import { useOptionalAppMessages } from "./use-app-messages.js";

export type AppText = (zhCN: string, enUS: string) => string;

export function useAppText(): AppText {
  const runtime = useOptionalAppMessages();
  const locale = runtime?.locale ?? "zh-CN";

  return useCallback(
    (zhCN: string, enUS: string): string => (locale === "en-US" ? enUS : zhCN),
    [locale],
  );
}

export type SaveStatusLabels = Record<SaveState, string>;

export function getSaveStatusLabels(text: AppText): SaveStatusLabels {
  return {
    idle: text("尚未编辑", "Not edited yet"),
    dirty: text("有未保存更改", "Unsaved changes"),
    saving: text("正在保存", "Saving"),
    saved: text("已保存", "Saved"),
    error: text("保存失败", "Save failed"),
    offline: text("本地存储不可用", "Local storage unavailable"),
  };
}

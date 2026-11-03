import { type SettingsWarning, type UserPreferences } from "@dailyflow/application";
import { Button, Input, SegmentedControl } from "@dailyflow/ui";
import { Check, History, LoaderCircle, MonitorCog, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { detectShortcutPlatform, type ShortcutPlatform } from "../platform/command-registry.js";
import { applyVisualPreferences } from "../preferences/apply-visual-preferences.js";
import { useUserPreferences } from "../preferences/use-user-preferences.js";
import { AiSettings } from "./ai-settings.js";
import { ShortcutHelpPanel } from "./shortcut-settings.js";

export interface SettingsPageProps {
  readonly platform?: ShortcutPlatform;
}

const weekDays = [
  ["0", "周日"],
  ["1", "周一"],
  ["2", "周二"],
  ["3", "周三"],
  ["4", "周四"],
  ["5", "周五"],
  ["6", "周六"],
] as const;

function warningIsVisible(preferences: UserPreferences, warning: SettingsWarning | null): boolean {
  return preferences.showWarnings && warning !== null;
}

export function SettingsPage({
  platform = detectShortcutPlatform(),
}: SettingsPageProps): React.JSX.Element {
  const { ai } = useAppServices();
  const { preferences, warning, loading, save: savePreferences } = useUserPreferences();
  const location = useLocation();
  const [draft, setDraft] = useState<UserPreferences>(preferences);
  const [failureWarning, setFailureWarning] = useState<SettingsWarning | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  useEffect(() => {
    applyVisualPreferences(draft);
    return () => {
      applyVisualPreferences(preferences);
    };
  }, [draft, preferences]);

  useEffect(() => {
    if (location.hash !== "#shortcut-help" || loading) {
      return;
    }
    document.getElementById("shortcut-help")?.scrollIntoView({ block: "start" });
  }, [loading, location.hash]);

  function updateDraft(patch: Partial<UserPreferences>): void {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveStatus("idle");
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveStatus("idle");
    setFailureWarning(null);
    try {
      const result = await savePreferences(draft);
      setDraft(result.preferences);
      setSaveStatus(result.persisted ? "saved" : "idle");
    } catch {
      setFailureWarning({
        code: "write_failed",
        message: "无法保存设置，请稍后重试。",
      });
      setSaveStatus("idle");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="grid min-h-full place-items-center p-6 text-sm text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
          正在读取本机设置
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface-muted/30 px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Device preferences</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">设置</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            管理当前设备的编辑、历史、快捷键和可选 AI 扩展。设置不会离开当前设备。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saved" ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check aria-hidden="true" className="size-3.5" />
              设置已保存
            </span>
          ) : null}
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-3.5" />
            )}
            保存设置
          </Button>
        </div>
      </header>

      {warningIsVisible(draft, failureWarning ?? warning) ? (
        <div role="alert" className="mt-4 border border-warning/35 bg-warning/10 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">设置未能完全保存</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {(failureWarning ?? warning)?.message}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <section
            aria-labelledby="appearance-settings-title"
            className="border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
                <MonitorCog aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Appearance</p>
                <h2
                  id="appearance-settings-title"
                  className="mt-0.5 text-base font-semibold text-foreground"
                >
                  外观与阅读密度
                </h2>
              </div>
            </div>

            <div className="mt-5 divide-y divide-border border-y border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">主题</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    跟随系统，或固定为浅色、深色。
                  </p>
                </div>
                <SegmentedControl
                  label="主题"
                  value={draft.theme}
                  options={[
                    { label: "系统", value: "system" },
                    { label: "浅色", value: "light" },
                    { label: "深色", value: "dark" },
                  ]}
                  onChange={(theme) => updateDraft({ theme })}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">密度</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    控制列表和工作区的信息间距。
                  </p>
                </div>
                <SegmentedControl
                  label="密度"
                  value={draft.density}
                  options={[
                    { label: "舒适", value: "comfortable" },
                    { label: "紧凑", value: "compact" },
                  ]}
                  onChange={(density) => updateDraft({ density })}
                />
              </div>
            </div>
          </section>

          <section
            aria-labelledby="editing-settings-title"
            className="border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase text-muted-foreground">Editor</p>
                <h2
                  id="editing-settings-title"
                  className="mt-0.5 text-base font-semibold text-foreground"
                >
                  编辑与日历
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                自动保存间隔（毫秒）
                <Input
                  type="number"
                  min={200}
                  max={10_000}
                  step={100}
                  value={draft.autosaveIntervalMs}
                  onChange={(event) =>
                    updateDraft({ autosaveIntervalMs: Number(event.currentTarget.value) })
                  }
                />
                <span className="text-[11px] font-normal leading-5 text-muted-foreground">
                  200–10000 毫秒；输入停止后再合并保存。
                </span>
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                每周起始日
                <select
                  value={draft.weekStartsOn}
                  onChange={(event) =>
                    updateDraft({ weekStartsOn: Number(event.currentTarget.value) })
                  }
                  className="h-9 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  {weekDays.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] font-normal leading-5 text-muted-foreground">
                  影响日历、周报和时间线分组。
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">显示设置提示</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  读取或保存异常时显示可恢复提示。
                </p>
              </div>
              <button
                type="button"
                aria-label="显示设置提示"
                aria-pressed={draft.showWarnings}
                onClick={() => updateDraft({ showWarnings: !draft.showWarnings })}
                className={[
                  "relative h-6 w-11 rounded-full border transition-colors",
                  draft.showWarnings
                    ? "border-primary bg-primary"
                    : "border-border-strong bg-surface-muted",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
                    draft.showWarnings ? "translate-x-5" : "translate-x-0.5",
                  ].join(" ")}
                />
              </button>
            </div>
          </section>

          <section
            aria-labelledby="history-settings-title"
            className="border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
                <History aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase text-muted-foreground">History</p>
                <h2
                  id="history-settings-title"
                  className="mt-0.5 text-base font-semibold text-foreground"
                >
                  历史版本保留
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  同时应用数量和天数上限，达到任一上限后按保留策略清理。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                最多保留版本数
                <Input
                  type="number"
                  min={10}
                  max={1000}
                  value={draft.historyRetention.maxVersions}
                  onChange={(event) =>
                    updateDraft({
                      historyRetention: {
                        ...draft.historyRetention,
                        maxVersions: Number(event.currentTarget.value),
                      },
                    })
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                最长保留天数
                <Input
                  type="number"
                  min={7}
                  max={3650}
                  value={draft.historyRetention.maxAgeDays}
                  onChange={(event) =>
                    updateDraft({
                      historyRetention: {
                        ...draft.historyRetention,
                        maxAgeDays: Number(event.currentTarget.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section className="border border-border bg-surface p-4 sm:p-5">
            <AiSettings providers={ai.providers} secretBackend={ai.secretBackend} />
          </section>
        </div>

        <aside className="grid content-start gap-5">
          <ShortcutHelpPanel platform={platform} />
          <div className="border border-border bg-surface p-4">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Persistence</p>
            <p className="mt-2 text-sm font-medium text-foreground">仅保存在当前设备</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              偏好通过共享 Repository 边界保存；桌面使用 SQLite，Web 使用 IndexedDB。
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {preferences.theme === "system" ? "跟随系统主题" : `${preferences.theme} theme`}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

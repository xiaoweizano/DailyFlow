import { type SettingsWarning, type UserPreferences } from "@dailyflow/application";
import { Button, Input, SegmentedControl, Select, Switch } from "@dailyflow/ui";
import {
  CalendarClock,
  Check,
  LayoutPanelLeft,
  LoaderCircle,
  MonitorCog,
  Palette,
  PenLine,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { detectShortcutPlatform, type ShortcutPlatform } from "../platform/command-registry.js";
import { applyVisualPreferences } from "../preferences/apply-visual-preferences.js";
import { getSettingsMessages } from "../preferences/messages.js";
import { useAppText } from "../preferences/use-app-text.js";
import { useUserPreferences } from "../preferences/use-user-preferences.js";
import { AboutSettings } from "./about-settings.js";
import { DataStorageSettings } from "./data-storage-settings.js";
import { SettingsNavigation, type SettingsSectionId } from "./settings-navigation.js";
import { SettingsSection } from "./settings-section.js";

export interface SettingsPageProps {
  readonly platform?: ShortcutPlatform;
  readonly storageLabel?: string;
  readonly version?: string;
}

function warningIsVisible(preferences: UserPreferences, warning: SettingsWarning | null): boolean {
  return preferences.showWarnings && warning !== null;
}

export function SettingsPage({
  platform = detectShortcutPlatform(),
  storageLabel = "SQLite",
  version = "0.3.0",
}: SettingsPageProps): React.JSX.Element {
  const { ai, storageLocation } = useAppServices();
  const text = useAppText();
  const { preferences, warning, loading, save: savePreferences } = useUserPreferences();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    location.hash === "#shortcut-help" ? "about" : "general",
  );
  const [draft, setDraft] = useState<UserPreferences | null>(null);
  const [failureWarning, setFailureWarning] = useState<SettingsWarning | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const effectiveDraft = draft ?? preferences;
  const messages = getSettingsMessages(preferences.locale);
  const isDesktop = platform === "windows" || platform === "macos";

  useEffect(() => {
    if (!loading) {
      setDraft(preferences);
    }
  }, [loading, preferences]);

  useEffect(() => {
    if (loading || draft === null) {
      return;
    }

    applyVisualPreferences(draft);
    return () => {
      applyVisualPreferences(preferences);
    };
  }, [draft, loading, preferences]);

  useEffect(() => {
    if (location.hash !== "#shortcut-help") {
      return;
    }

    setActiveSection("about");
    if (loading) {
      return;
    }

    const timer = window.setTimeout(() => {
      const shortcutPanel = document.getElementById("shortcut-help");
      shortcutPanel?.scrollIntoView({ block: "start" });
      shortcutPanel?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loading, location.hash]);

  function updateDraft(patch: Partial<UserPreferences>): void {
    setDraft((current) => ({ ...(current ?? preferences), ...patch }));
    setSaveStatus("idle");
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveStatus("idle");
    setFailureWarning(null);
    try {
      const result = await savePreferences(effectiveDraft);
      setDraft(result.preferences);
      setSaveStatus(result.persisted ? "saved" : "idle");
    } catch {
      setFailureWarning({
        code: "write_failed",
        message: text(
          "无法保存设置，请稍后重试。",
          "Unable to save settings. Please try again later.",
        ),
      });
      setSaveStatus("idle");
    } finally {
      setSaving(false);
    }
  }

  const activePanelId = `settings-panel-${activeSection}`;

  return (
    <div className="min-h-full bg-surface-muted/30 px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">{messages.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{messages.title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {messages.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saved" ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check aria-hidden="true" className="size-3.5" />
              {messages.saved}
            </span>
          ) : null}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            aria-label={messages.save}
          >
            {saving ? (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-3.5" />
            )}
            {saving ? messages.saving : messages.save}
          </Button>
        </div>
      </header>

      {warningIsVisible(effectiveDraft, failureWarning ?? warning) ? (
        <div role="alert" className="mt-4 border border-warning/35 bg-warning/10 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">{messages.warningTitle}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {(failureWarning ?? warning)?.message}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="min-w-0 border border-border bg-surface p-2 lg:sticky lg:top-0">
          <SettingsNavigation
            activeId={activeSection}
            messages={messages}
            onChange={setActiveSection}
          />
        </aside>

        <div
          id={activePanelId}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeSection}`}
          className="min-w-0"
        >
          {loading ? (
            <div
              role="status"
              className="grid min-h-64 place-items-center border border-border bg-surface p-6 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
                {messages.loading}
              </span>
            </div>
          ) : (
            <>
              {activeSection === "general" ? (
                <SettingsSection
                  id="general-settings"
                  eyebrow="General"
                  title={messages.general.title}
                  description={messages.general.description}
                  icon={MonitorCog}
                >
                  <div className="divide-y divide-border border-y border-border">
                    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {messages.general.language}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {messages.general.languageDescription}
                        </p>
                      </div>
                      <div
                        role="radiogroup"
                        aria-label={messages.general.language}
                        className="grid grid-cols-2 gap-2"
                      >
                        {[
                          {
                            value: "zh-CN" as const,
                            label: "简体中文",
                            description: "中文界面",
                          },
                          {
                            value: "en-US" as const,
                            label: "English",
                            description: "English interface",
                          },
                        ].map((option) => {
                          const selected = effectiveDraft.locale === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-label={option.label}
                              aria-checked={selected}
                              className={[
                                "min-w-0 rounded-[var(--radius-control)] border px-3 py-2.5 text-left transition-colors",
                                selected
                                  ? "border-primary bg-primary/8 text-foreground shadow-sm"
                                  : "border-border-strong bg-surface text-muted-foreground hover:border-primary/35 hover:text-foreground",
                              ].join(" ")}
                              onClick={() => updateDraft({ locale: option.value })}
                            >
                              <span className="block truncate text-sm font-medium">
                                {option.label}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px]">
                                {option.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="py-4">
                      <div className="mb-3 flex items-start gap-2.5">
                        <LayoutPanelLeft
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {messages.general.startup}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {isDesktop
                              ? messages.general.startupDescription
                              : text(
                                  "Web 端由浏览器标签页生命周期管理，不提供系统启动或托盘选项。",
                                  "The browser manages the web app lifecycle; startup and tray options are unavailable.",
                                )}
                          </p>
                        </div>
                      </div>
                      <div
                        data-settings-group="startup-background"
                        className="grid divide-y divide-border"
                      >
                        <SettingSwitchRow
                          label={messages.general.autostart}
                          description={messages.general.autostartDescription}
                          checked={effectiveDraft.autostart}
                          disabled={!isDesktop}
                          onCheckedChange={(autostart) => updateDraft({ autostart })}
                        />
                        <SettingSwitchRow
                          label={messages.general.silentStart}
                          description={messages.general.silentStartDescription}
                          checked={effectiveDraft.silentStart}
                          disabled={!isDesktop}
                          onCheckedChange={(silentStart) => updateDraft({ silentStart })}
                        />
                        <div className="py-3.5">
                          <p className="text-sm font-medium text-foreground">
                            {messages.general.closeBehavior}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {messages.general.closeBehaviorDescription}
                          </p>
                          <div
                            role="radiogroup"
                            aria-label={messages.general.closeBehavior}
                            className="mt-3 grid gap-2 sm:grid-cols-3"
                          >
                            {[
                              {
                                value: "ask" as const,
                                label: messages.general.ask,
                                description: messages.general.askDescription,
                              },
                              {
                                value: "minimize" as const,
                                label: messages.general.minimize,
                                description: messages.general.minimizeDescription,
                              },
                              {
                                value: "quit" as const,
                                label: messages.general.quit,
                                description: messages.general.quitDescription,
                              },
                            ].map((option) => {
                              const selected = effectiveDraft.closeBehavior === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  role="radio"
                                  aria-label={option.label}
                                  aria-checked={selected}
                                  disabled={!isDesktop}
                                  className={[
                                    "min-w-0 rounded-[var(--radius-control)] border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                                    selected
                                      ? "border-primary bg-primary/8 text-foreground shadow-sm"
                                      : "border-border-strong bg-surface text-muted-foreground hover:border-primary/35 hover:text-foreground",
                                  ].join(" ")}
                                  onClick={() => updateDraft({ closeBehavior: option.value })}
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium">
                                      {option.label}
                                    </span>
                                    {selected ? (
                                      <Check
                                        aria-hidden="true"
                                        className="size-3.5 shrink-0 text-primary"
                                      />
                                    ) : null}
                                  </span>
                                  <span className="mt-1 block text-[11px] leading-4">
                                    {option.description}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div data-settings-group="interface-feedback" className="py-4">
                      <h3 className="text-sm font-medium text-foreground">
                        {messages.general.interfaceFeedback}
                      </h3>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {messages.general.interfaceFeedbackDescription}
                      </p>
                      <div className="mt-3">
                        <SettingSwitchRow
                          label={messages.general.warnings}
                          description={messages.general.warningsDescription}
                          checked={effectiveDraft.showWarnings}
                          onCheckedChange={(showWarnings) => updateDraft({ showWarnings })}
                        />
                      </div>
                    </div>
                  </div>
                </SettingsSection>
              ) : null}

              {activeSection === "appearance" ? (
                <SettingsSection
                  id="appearance-settings"
                  eyebrow="Appearance"
                  title={messages.appearance.title}
                  description={messages.appearance.description}
                  icon={Palette}
                >
                  <div className="divide-y divide-border border-y border-border">
                    <div className="py-4">
                      <p className="text-sm font-medium text-foreground">
                        {messages.appearance.theme}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {messages.appearance.themeDescription}
                      </p>
                      <div
                        role="radiogroup"
                        aria-label={messages.appearance.theme}
                        className="mt-3 grid gap-2 sm:grid-cols-3"
                      >
                        {[
                          {
                            value: "system" as const,
                            label: messages.appearance.system,
                            preview: "split" as const,
                          },
                          {
                            value: "light" as const,
                            label: messages.appearance.light,
                            preview: "light" as const,
                          },
                          {
                            value: "dark" as const,
                            label: messages.appearance.dark,
                            preview: "dark" as const,
                          },
                        ].map((option) => {
                          const selected = effectiveDraft.theme === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-label={option.label}
                              aria-checked={selected}
                              className={[
                                "min-w-0 rounded-[var(--radius-control)] border p-2.5 text-left transition-colors",
                                selected
                                  ? "border-primary bg-primary/8 text-foreground shadow-sm"
                                  : "border-border-strong bg-surface text-muted-foreground hover:border-primary/35 hover:text-foreground",
                              ].join(" ")}
                              onClick={() => updateDraft({ theme: option.value })}
                            >
                              <ThemePreview mode={option.preview} />
                              <span className="mt-2 flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{option.label}</span>
                                {selected ? (
                                  <Check
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0 text-primary"
                                  />
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="py-4">
                      <p className="text-sm font-medium text-foreground">
                        {messages.appearance.accent}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {messages.appearance.accentDescription}
                      </p>
                      <div
                        role="radiogroup"
                        aria-label={messages.appearance.accent}
                        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"
                      >
                        {[
                          {
                            value: "blue" as const,
                            label: messages.appearance.blue,
                            swatch: "hsl(210 72% 45%)",
                          },
                          {
                            value: "green" as const,
                            label: messages.appearance.green,
                            swatch: "hsl(151 55% 36%)",
                          },
                          {
                            value: "amber" as const,
                            label: messages.appearance.amber,
                            swatch: "hsl(32 82% 40%)",
                          },
                          {
                            value: "rose" as const,
                            label: messages.appearance.rose,
                            swatch: "hsl(344 62% 46%)",
                          },
                          {
                            value: "neutral" as const,
                            label: messages.appearance.neutral,
                            swatch: "hsl(220 9% 38%)",
                          },
                        ].map((option) => {
                          const selected = effectiveDraft.accent === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-label={option.label}
                              aria-checked={selected}
                              className={[
                                "flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] border px-3 py-3 text-left transition-colors",
                                selected
                                  ? "border-primary bg-primary/8 text-foreground shadow-sm"
                                  : "border-border-strong bg-surface text-muted-foreground hover:border-primary/35 hover:text-foreground",
                              ].join(" ")}
                              onClick={() => updateDraft({ accent: option.value })}
                            >
                              <span
                                aria-hidden="true"
                                className="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0_/_0.12)]"
                                style={{ backgroundColor: option.swatch }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {option.label}
                              </span>
                              {selected ? (
                                <Check
                                  aria-hidden="true"
                                  className="size-3.5 shrink-0 text-primary"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="py-4">
                      <p className="text-sm font-medium text-foreground">
                        {messages.appearance.density}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {messages.appearance.densityDescription}
                      </p>
                      <div
                        role="radiogroup"
                        aria-label={messages.appearance.density}
                        className="mt-3 grid gap-2 sm:grid-cols-3"
                      >
                        {[
                          {
                            value: "compact" as const,
                            label: messages.appearance.compact,
                            rowHeight: 4,
                          },
                          {
                            value: "comfortable" as const,
                            label: messages.appearance.comfortable,
                            rowHeight: 6,
                          },
                          {
                            value: "spacious" as const,
                            label: messages.appearance.spacious,
                            rowHeight: 8,
                          },
                        ].map((option) => {
                          const selected = effectiveDraft.density === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-label={option.label}
                              aria-checked={selected}
                              className={[
                                "min-w-0 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
                                selected
                                  ? "border-primary bg-primary/8 text-foreground shadow-sm"
                                  : "border-border-strong bg-surface text-muted-foreground hover:border-primary/35 hover:text-foreground",
                              ].join(" ")}
                              onClick={() => updateDraft({ density: option.value })}
                            >
                              <span aria-hidden="true" className="grid gap-1">
                                {[0, 1, 2].map((row) => (
                                  <span
                                    key={row}
                                    className="rounded-[2px] bg-current opacity-20"
                                    style={{ height: option.rowHeight }}
                                  />
                                ))}
                              </span>
                              <span className="mt-2.5 flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{option.label}</span>
                                {selected ? (
                                  <Check
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0 text-primary"
                                  />
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </SettingsSection>
              ) : null}

              {activeSection === "editor" ? (
                <SettingsSection
                  id="editor-settings"
                  eyebrow="Editor"
                  title={messages.editor.title}
                  description={messages.editor.description}
                  icon={PenLine}
                >
                  <div className="grid gap-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium text-foreground">
                        {messages.editor.fontSize}
                        <Input
                          aria-label={messages.editor.fontSize}
                          type="number"
                          min={13}
                          max={20}
                          value={effectiveDraft.editorFontSize}
                          onChange={(event) =>
                            updateDraft({
                              editorFontSize: Number(event.currentTarget.value),
                            })
                          }
                        />
                      </label>
                      <div className="grid gap-1.5">
                        <p className="text-sm font-medium text-foreground">
                          {messages.editor.width}
                        </p>
                        <SegmentedControl
                          label={messages.editor.width}
                          value={effectiveDraft.editorWidth}
                          options={[
                            { label: messages.editor.focused, value: "focused" },
                            { label: messages.editor.wide, value: "wide" },
                          ]}
                          onChange={(editorWidth) => updateDraft({ editorWidth })}
                        />
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          {messages.editor.widthDescription}
                        </p>
                      </div>
                    </div>

                    <SettingSwitchRow
                      label={messages.editor.outline}
                      description={messages.editor.outlineDescription}
                      checked={effectiveDraft.showOutline}
                      onCheckedChange={(showOutline) => updateDraft({ showOutline })}
                    />

                    <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium text-foreground">
                        {messages.editor.autosave}
                        <Input
                          aria-label={messages.editor.autosave}
                          type="number"
                          min={200}
                          max={10_000}
                          step={100}
                          value={effectiveDraft.autosaveIntervalMs}
                          onChange={(event) =>
                            updateDraft({
                              autosaveIntervalMs: Number(event.currentTarget.value),
                            })
                          }
                        />
                        <span className="text-[11px] font-normal leading-5 text-muted-foreground">
                          {messages.editor.autosaveDescription}
                        </span>
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium text-foreground">
                        {messages.editor.weekStart}
                        <Select
                          aria-label={messages.editor.weekStart}
                          value={effectiveDraft.weekStartsOn}
                          onChange={(event) =>
                            updateDraft({
                              weekStartsOn: Number(event.currentTarget.value),
                            })
                          }
                        >
                          {[
                            [0, text("周日", "Sunday")],
                            [1, text("周一", "Monday")],
                            [2, text("周二", "Tuesday")],
                            [3, text("周三", "Wednesday")],
                            [4, text("周四", "Thursday")],
                            [5, text("周五", "Friday")],
                            [6, text("周六", "Saturday")],
                          ].map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                        <span className="text-[11px] font-normal leading-5 text-muted-foreground">
                          {messages.editor.weekStartDescription}
                        </span>
                      </label>
                    </div>

                    <div className="flex items-start gap-2.5 bg-surface-muted/55 px-3 py-2.5">
                      <CalendarClock
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {text(
                          "自动保存与每周起始日会同时影响编辑器和日历分析，但不会改变既有日志内容。",
                          "Autosave and the week start affect the editor and calendar analysis without changing existing journal content.",
                        )}
                      </p>
                    </div>
                  </div>
                </SettingsSection>
              ) : null}

              {activeSection === "data" ? (
                <DataStorageSettings
                  preferences={effectiveDraft}
                  messages={messages}
                  platform={platform}
                  storageLabel={storageLabel}
                  {...(storageLocation === undefined ? {} : { storageLocation })}
                  onUpdate={updateDraft}
                />
              ) : null}

              {activeSection === "about" ? (
                <AboutSettings
                  messages={messages}
                  platform={platform}
                  storageLabel={storageLabel}
                  version={version}
                  providers={ai.providers}
                  secretBackend={ai.secretBackend}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThemePreview({ mode }: { readonly mode: "split" | "light" | "dark" }): React.JSX.Element {
  const previewClass = {
    split: "border-border bg-surface",
    light: "border-zinc-300 bg-white",
    dark: "border-zinc-700 bg-zinc-900",
  }[mode];
  const sidebarClass = {
    split: "border-border bg-surface-muted",
    light: "border-zinc-200 bg-zinc-100",
    dark: "border-zinc-700 bg-zinc-800",
  }[mode];
  const lineClass = {
    split: "bg-muted-foreground/30",
    light: "bg-zinc-400/45",
    dark: "bg-zinc-500/55",
  }[mode];

  return (
    <span
      aria-hidden="true"
      className={`grid h-14 grid-cols-[36%_1fr] overflow-hidden rounded-[4px] border ${previewClass}`}
    >
      <span className={`border-r p-1.5 ${sidebarClass}`}>
        <span className={`block h-1.5 w-3/4 rounded-[2px] ${lineClass}`} />
        <span className={`mt-1 block h-1.5 w-full rounded-[2px] ${lineClass}`} />
        <span className={`mt-1 block h-1.5 w-2/3 rounded-[2px] ${lineClass}`} />
      </span>
      <span className="p-2">
        <span className={`block h-1.5 w-1/2 rounded-[2px] ${lineClass}`} />
        <span className={`mt-1.5 block h-1 w-full rounded-[2px] ${lineClass}`} />
        <span className={`mt-1 block h-1 w-4/5 rounded-[2px] ${lineClass}`} />
      </span>
    </span>
  );
}

interface SettingSwitchRowProps {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

function SettingSwitchRow({
  label,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: SettingSwitchRowProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

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
import { useAppMessages } from "../preferences/use-app-messages.js";
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
  const { setLocalePreview } = useAppMessages();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    location.hash === "#shortcut-help" ? "about" : "general",
  );
  const [draft, setDraft] = useState<UserPreferences | null>(null);
  const [failureWarning, setFailureWarning] = useState<SettingsWarning | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const effectiveDraft = draft ?? preferences;
  const messages = getSettingsMessages(effectiveDraft.locale);
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
    if (loading) {
      return;
    }

    setLocalePreview(effectiveDraft.locale);
    return () => setLocalePreview(null);
  }, [effectiveDraft.locale, loading, setLocalePreview]);

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
                      <Select
                        aria-label={messages.general.language}
                        value={effectiveDraft.locale}
                        onChange={(event) =>
                          updateDraft({
                            locale: event.currentTarget.value as UserPreferences["locale"],
                          })
                        }
                      >
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English</option>
                      </Select>
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
                        className="grid divide-y divide-border border-y border-border"
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
                        <SettingSwitchRow
                          label={messages.general.closeToTray}
                          description={messages.general.closeToTrayDescription}
                          checked={effectiveDraft.closeToTray}
                          disabled={!isDesktop}
                          onCheckedChange={(closeToTray) => updateDraft({ closeToTray })}
                        />
                      </div>
                    </div>

                    <div data-settings-group="interface-feedback" className="py-4">
                      <h3 className="text-sm font-medium text-foreground">
                        {messages.general.interfaceFeedback}
                      </h3>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {messages.general.interfaceFeedbackDescription}
                      </p>
                      <div className="mt-3 border-y border-border">
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
                    <SettingControlRow
                      label={messages.appearance.theme}
                      description={messages.appearance.themeDescription}
                    >
                      <SegmentedControl
                        label={messages.appearance.theme}
                        value={effectiveDraft.theme}
                        options={[
                          { label: messages.appearance.system, value: "system" },
                          { label: messages.appearance.light, value: "light" },
                          { label: messages.appearance.dark, value: "dark" },
                        ]}
                        onChange={(theme) => updateDraft({ theme })}
                      />
                    </SettingControlRow>
                    <SettingControlRow
                      label={messages.appearance.accent}
                      description={messages.appearance.accentDescription}
                    >
                      <SegmentedControl
                        label={messages.appearance.accent}
                        value={effectiveDraft.accent}
                        options={[
                          { label: messages.appearance.blue, value: "blue" },
                          { label: messages.appearance.green, value: "green" },
                          { label: messages.appearance.amber, value: "amber" },
                          { label: messages.appearance.rose, value: "rose" },
                          { label: messages.appearance.neutral, value: "neutral" },
                        ]}
                        onChange={(accent) => updateDraft({ accent })}
                      />
                    </SettingControlRow>
                    <SettingControlRow
                      label={messages.appearance.density}
                      description={messages.appearance.densityDescription}
                    >
                      <SegmentedControl
                        label={messages.appearance.density}
                        value={effectiveDraft.density}
                        options={[
                          { label: messages.appearance.compact, value: "compact" },
                          { label: messages.appearance.comfortable, value: "comfortable" },
                          { label: messages.appearance.spacious, value: "spacious" },
                        ]}
                        onChange={(density) => updateDraft({ density })}
                      />
                    </SettingControlRow>
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

interface SettingControlRowProps {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}

function SettingControlRow({
  label,
  description,
  children,
}: SettingControlRowProps): React.JSX.Element {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 sm:justify-self-end">{children}</div>
    </div>
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

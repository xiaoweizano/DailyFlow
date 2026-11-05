// @vitest-environment jsdom

import "./setup-dom.js";

import {
  DEFAULT_USER_PREFERENCES,
  type AiProviderRegistry,
  type SecretStoreBackend,
  type UserPreferences,
  type UserPreferencesLoadResult,
  type UserPreferencesSaveResult,
} from "@dailyflow/application";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AppRuntimeServices } from "../src/app-services-context.js";
import type { StorageLocationRuntimeServices } from "../src/app-services-context.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { SettingsPage } from "../src/settings/settings-page.js";

interface SettingsRuntimeStub {
  readonly load: () => Promise<UserPreferencesLoadResult>;
  readonly save: (input: unknown) => Promise<UserPreferencesSaveResult>;
  readonly applyRuntimePreferences?: (preferences: UserPreferences) => Promise<void>;
  readonly storageLocation?: StorageLocationRuntimeServices;
}

function createSettingsServices({
  load,
  save,
  applyRuntimePreferences,
  storageLocation,
}: SettingsRuntimeStub): AppRuntimeServices {
  const registry: AiProviderRegistry = {
    list: () => [
      {
        id: "disabled",
        displayName: "未配置",
        capabilities: [],
        sendsDataOffDevice: false,
      },
    ],
    resolve: () => null,
  };
  const backend: SecretStoreBackend = "session-memory";

  return {
    settings: {
      load,
      save,
      ...(applyRuntimePreferences === undefined ? {} : { applyRuntimePreferences }),
    },
    ...(storageLocation === undefined ? {} : { storageLocation }),
    ai: {
      providers: registry.list(),
      secretBackend: backend,
      prepare: vi.fn(),
      run: vi.fn(),
    },
  } as unknown as AppRuntimeServices;
}

function loaded(
  preferences: UserPreferences = DEFAULT_USER_PREFERENCES,
): UserPreferencesLoadResult {
  return {
    preferences,
    warning: null,
  };
}

function renderSettings(
  services: AppRuntimeServices,
  platform: "windows" | "macos" | "web" = "windows",
): void {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <AppServicesProvider services={services}>
        <SettingsPage platform={platform} />
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("settings page", () => {
  it("applies persisted visual preferences at application startup", async () => {
    const persistedPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      theme: "dark" as const,
      accent: "green" as const,
      density: "compact" as const,
      editorFontSize: 17,
      editorWidth: "focused" as const,
    };
    const load = vi.fn(async () =>
      loaded(persistedPreferences),
    );
    const save = vi.fn(async () => ({
      preferences: DEFAULT_USER_PREFERENCES,
      persisted: true,
      warning: null,
    }));
    const applyRuntimePreferences = vi.fn(async () => undefined);

    render(
      <AppServicesProvider
        services={createSettingsServices({ load, save, applyRuntimePreferences })}
      >
        <div>Global workspace</div>
      </AppServicesProvider>,
    );

    expect(await screen.findByText("Global workspace")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.accent).toBe("green");
      expect(document.documentElement.dataset.density).toBe("compact");
      expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe("17px");
      expect(document.documentElement.style.getPropertyValue("--editor-content-width")).toBe(
        "min(100%, 72ch)",
      );
      expect(applyRuntimePreferences).toHaveBeenCalledWith(persistedPreferences);
    });
  });

  it("loads device preferences and shows the unconfigured AI boundary", async () => {
    const load = vi.fn(async () =>
      loaded({
        ...DEFAULT_USER_PREFERENCES,
        theme: "dark",
        density: "compact",
      }),
    );
    const save = vi.fn(async () => ({
      preferences: DEFAULT_USER_PREFERENCES,
      persisted: true,
      warning: null,
    }));

    renderSettings(createSettingsServices({ load, save }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "设置分类" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "常规" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "外观" }));
    expect(await screen.findByRole("group", { name: "主题" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "主题" })).getByRole("button", {
        name: "深色",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("group", { name: "密度" })).getByRole("button", {
        name: "紧凑",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("tab", { name: "关于" }));
    expect(screen.getByText("未配置")).toBeInTheDocument();
    expect(screen.getByText(/当前标签页内存/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API Key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /发起请求|测试连接/ })).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });

  it("never reveals default controls after persisted preferences finish loading", async () => {
    let resolveLoad: (result: UserPreferencesLoadResult) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<UserPreferencesLoadResult>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const save = vi.fn(async () => ({
      preferences: DEFAULT_USER_PREFERENCES,
      persisted: true,
      warning: null,
    }));
    const themeStates: string[] = [];
    const observer = new MutationObserver(() => {
      const theme = screen.queryByRole("group", { name: "主题" });
      if (theme === null) {
        return;
      }
      themeStates.push(
        within(theme).getByRole("button", { name: "深色" }).getAttribute("aria-pressed") ?? "",
      );
    });

    renderSettings(createSettingsServices({ load, save }));
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
      childList: true,
      subtree: true,
    });

    try {
      expect(screen.getByRole("status")).toHaveTextContent("正在读取本机设置");
      resolveLoad(
        loaded({
          ...DEFAULT_USER_PREFERENCES,
          theme: "dark",
          density: "compact",
        }),
      );

      await userEvent.click(screen.getByRole("tab", { name: "外观" }));
      await vi.waitFor(() => {
        expect(
          within(screen.getByRole("group", { name: "主题" })).getByRole("button", {
            name: "深色",
          }),
        ).toHaveAttribute("aria-pressed", "true");
      });

      expect(themeStates).not.toContain("false");
    } finally {
      observer.disconnect();
    }
  });

  it("saves edited preferences only after an explicit action", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async (input: unknown) => ({
      preferences: input as UserPreferences,
      persisted: true,
      warning: null,
    }));
    const applyRuntimePreferences = vi.fn(async () => undefined);

    renderSettings(createSettingsServices({ load, save, applyRuntimePreferences }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(applyRuntimePreferences).toHaveBeenCalledWith(DEFAULT_USER_PREFERENCES);
    });
    applyRuntimePreferences.mockClear();

    await userEvent.click(screen.getByRole("tab", { name: "外观" }));
    const theme = await screen.findByRole("group", { name: "主题" });
    await user.click(within(theme).getByRole("button", { name: "深色" }));
    await user.click(screen.getByRole("tab", { name: "编辑器" }));
    const interval = screen.getByLabelText(/自动保存间隔/);
    await user.clear(interval);
    await user.type(interval, "1200");
    expect(save).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        autosaveIntervalMs: 1200,
      }),
    );
    expect(applyRuntimePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        autosaveIntervalMs: 1200,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("设置已保存");
  });

  it("reports a failed persistence attempt without claiming success", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async () => ({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        density: "compact" as const,
      },
      persisted: false,
      warning: {
        code: "write_failed" as const,
        message: "无法保存设置，请稍后重试。",
      },
    }));
    const applyRuntimePreferences = vi.fn(async () => undefined);

    renderSettings(createSettingsServices({ load, save, applyRuntimePreferences }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(applyRuntimePreferences).toHaveBeenCalledWith(DEFAULT_USER_PREFERENCES);
    });
    applyRuntimePreferences.mockClear();

    await userEvent.click(screen.getByRole("tab", { name: "外观" }));
    const density = await screen.findByRole("group", { name: "密度" });
    await user.click(within(density).getByRole("button", { name: "紧凑" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("无法保存设置");
    expect(screen.queryByText("设置已保存")).not.toBeInTheDocument();
    expect(applyRuntimePreferences).not.toHaveBeenCalled();
  });

  it("shows invalid persisted values as a warning using safe defaults", async () => {
    const load = vi.fn(async () => ({
      preferences: DEFAULT_USER_PREFERENCES,
      warning: {
        code: "invalid_value" as const,
        message: "设置值无效，已使用默认设置。",
      },
    }));
    const save = vi.fn(async () => ({
      preferences: DEFAULT_USER_PREFERENCES,
      persisted: true,
      warning: null,
    }));

    renderSettings(createSettingsServices({ load, save }));

    expect(await screen.findByRole("alert")).toHaveTextContent("设置值无效");
    await userEvent.click(screen.getByRole("tab", { name: "常规" }));
    expect(screen.getByRole("switch", { name: "显示设置提示" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("exposes general, appearance, editor, data, and about settings", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async (input: unknown) => ({
      preferences: input as UserPreferences,
      persisted: true,
      warning: null,
    }));

    renderSettings(createSettingsServices({ load, save }));

    expect(await screen.findByRole("tab", { name: "常规" })).toBeInTheDocument();
    expect(screen.getByLabelText("界面语言")).toHaveValue("zh-CN");
    expect(screen.getByRole("switch", { name: "开机自启" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("switch", { name: "静默启动" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("switch", { name: "关闭到托盘" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "外观" }));
    expect(screen.getByRole("group", { name: "强调色" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "密度" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "编辑器" }));
    expect(screen.getByRole("spinbutton", { name: "编辑器字号" })).toHaveValue(15);
    expect(screen.getByRole("group", { name: "编辑器宽度" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "显示文档大纲" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "数据" }));
    expect(screen.getByRole("heading", { name: "数据与存储" })).toBeInTheDocument();
    expect(screen.getByText(/桌面端.*SQLite/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "关于" }));
    expect(screen.getByRole("heading", { name: "关于与扩展" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "快捷键" })).toBeInTheDocument();
  });

  it("migrates the complete preference document and shows the verified destination", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async (input: unknown) => ({
      preferences: input as UserPreferences,
      persisted: true,
      warning: null,
    }));
    const storageLocation: StorageLocationRuntimeServices = {
      get: vi.fn(async () => ({
        currentDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
        defaultDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
        isCustom: false,
      })),
      migrate: vi.fn(async (preferences) => ({
        ...preferences,
        currentDirectory: "D:\\DailyFlow",
        defaultDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
        destination: "D:\\DailyFlow",
        backupDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow\\.dailyflow-migration-backups\\backup-1",
        isCustom: true,
        restartRequired: true,
        preferences,
      })),
    };

    renderSettings(createSettingsServices({ load, save, storageLocation }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "数据" }));
    expect(
      await screen.findByDisplayValue("C:\\Users\\office\\AppData\\Roaming\\DailyFlow"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更改存储位置" }));

    expect(storageLocation.migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: DEFAULT_USER_PREFERENCES.schemaVersion,
        autostart: DEFAULT_USER_PREFERENCES.autostart,
        silentStart: DEFAULT_USER_PREFERENCES.silentStart,
        closeToTray: DEFAULT_USER_PREFERENCES.closeToTray,
        editorFontSize: DEFAULT_USER_PREFERENCES.editorFontSize,
        editorWidth: DEFAULT_USER_PREFERENCES.editorWidth,
        autosaveIntervalMs: DEFAULT_USER_PREFERENCES.autosaveIntervalMs,
        historyRetention: DEFAULT_USER_PREFERENCES.historyRetention,
      }),
    );
    expect(await screen.findByText(/请重启 DailyFlow/)).toBeInTheDocument();
    expect(screen.getByText(/backup-1/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("D:\\DailyFlow")).toBeInTheDocument();
  });

  it("explains browser-managed storage without exposing desktop migration controls", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async (input: unknown) => ({
      preferences: input as UserPreferences,
      persisted: true,
      warning: null,
    }));
    const storageLocation: StorageLocationRuntimeServices = {
      get: vi.fn(),
      migrate: vi.fn(),
    };

    renderSettings(createSettingsServices({ load, save, storageLocation }), "web");

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "数据" }));

    expect(screen.getByText(/浏览器不提供自定义数据目录/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更改存储位置" })).not.toBeInTheDocument();
    expect(storageLocation.get).not.toHaveBeenCalled();
  });

  it("switches the settings language without saving prematurely", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async (input: unknown) => ({
      preferences: input as UserPreferences,
      persisted: true,
      warning: null,
    }));

    renderSettings(createSettingsServices({ load, save }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("界面语言"), "en-US");

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});

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
import { AppServicesProvider } from "../src/app-services-provider.js";
import { SettingsPage } from "../src/settings/settings-page.js";

interface SettingsRuntimeStub {
  readonly load: () => Promise<UserPreferencesLoadResult>;
  readonly save: (input: unknown) => Promise<UserPreferencesSaveResult>;
}

function createSettingsServices({ load, save }: SettingsRuntimeStub): AppRuntimeServices {
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
    settings: { load, save },
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

function renderSettings(services: AppRuntimeServices): void {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <AppServicesProvider services={services}>
        <SettingsPage platform="windows" />
      </AppServicesProvider>
    </MemoryRouter>,
  );
}

describe("settings page", () => {
  it("applies persisted visual preferences at application startup", async () => {
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

    render(
      <AppServicesProvider services={createSettingsServices({ load, save })}>
        <div>Global workspace</div>
      </AppServicesProvider>,
    );

    expect(await screen.findByText("Global workspace")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.density).toBe("compact");
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
    expect(screen.getByText("未配置")).toBeInTheDocument();
    expect(screen.getByText(/当前标签页内存/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API Key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /发起请求|测试连接/ })).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });

  it("saves edited preferences only after an explicit action", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => loaded());
    const save = vi.fn(async (input: unknown) => ({
      preferences: input as UserPreferences,
      persisted: true,
      warning: null,
    }));

    renderSettings(createSettingsServices({ load, save }));

    const theme = await screen.findByRole("group", { name: "主题" });
    await user.click(within(theme).getByRole("button", { name: "深色" }));
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

    renderSettings(createSettingsServices({ load, save }));

    const density = await screen.findByRole("group", { name: "密度" });
    await user.click(within(density).getByRole("button", { name: "紧凑" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("无法保存设置");
    expect(screen.queryByText("设置已保存")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "显示设置提示" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

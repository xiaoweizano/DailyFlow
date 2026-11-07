// @vitest-environment jsdom

import "./setup-dom.js";

import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
  type UserPreferencesLoadResult,
  type UserPreferencesSaveResult,
} from "@dailyflow/application";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AppRuntimeServices } from "../src/app-services-context.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { AppShell } from "../src/app-shell.js";
import { SettingsPage } from "../src/settings/settings-page.js";

function createLocaleServices(
  load: () => Promise<UserPreferencesLoadResult>,
  save: (input: unknown) => Promise<UserPreferencesSaveResult>,
): AppRuntimeServices {
  return {
    settings: { load, save },
    ai: {
      providers: [],
      secretBackend: "session-memory",
      prepare: vi.fn(),
      run: vi.fn(),
    },
  } as unknown as AppRuntimeServices;
}

describe("global locale", () => {
  it("updates the shell and current route after preferences are saved", async () => {
    const user = userEvent.setup();
    let preferences = DEFAULT_USER_PREFERENCES;
    const load = vi.fn(async () => ({ preferences, warning: null }));
    const save = vi.fn(async (input: unknown) => {
      preferences = input as UserPreferences;
      return { preferences, persisted: true, warning: null };
    });

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AppServicesProvider services={createLocaleServices(load, save)}>
          <Routes>
            <Route
              element={<AppShell platform="web" storageLabel="Browser storage" version="0.1.0" />}
            >
              <Route path="settings" element={<SettingsPage platform="web" />} />
            </Route>
          </Routes>
        </AppServicesProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "工作台" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "English" }));

    expect(screen.getByRole("link", { name: "工作台" })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByRole("link", { name: "Workbench" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daily Journal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Knowledge Base" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Help center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en-US");
  });
});

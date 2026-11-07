// @vitest-environment jsdom

import "./setup-dom.js";

import { DEFAULT_USER_PREFERENCES } from "@dailyflow/application";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import { JournalTemplatePicker } from "../src/journal/journal-template-picker.js";
import type { JournalTemplate } from "../src/journal/journal-templates.js";

describe("JournalTemplatePicker", () => {
  it("renders English built-in template names, descriptions, and starter content", async () => {
    const runtime = createRuntimeSettingsStub();
    runtime.settings.load = vi.fn(async () => ({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        locale: "en-US" as const,
      },
      warning: null,
    }));
    const onSelect = vi.fn<(template: JournalTemplate | null) => void>();
    const user = userEvent.setup();

    render(
      <AppServicesProvider services={runtime as never}>
        <JournalTemplatePicker onSelect={onSelect} />
      </AppServicesProvider>,
    );

    const dailyTemplate = await screen.findByRole("button", { name: /Daily report/u });
    expect(within(dailyTemplate).getByText("Daily report")).toBeInTheDocument();
    expect(
      within(dailyTemplate).getByText("Capture what was completed, tomorrow's plan, and blockers"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Custom template" }));
    expect(screen.getByRole("textbox", { name: "Template content" })).toHaveValue(
      "## Today's journal\n\n",
    );

    await user.click(dailyTemplate);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "daily",
        markdown: expect.stringContaining("## Completed today"),
      }),
    );
  });
});

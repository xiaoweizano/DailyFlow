// @vitest-environment jsdom

import "./setup-dom.js";

import { DEFAULT_USER_PREFERENCES, type LocalePreference } from "@dailyflow/application";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppMessagesProvider } from "../src/preferences/app-messages-context.js";
import { UserPreferencesProvider } from "../src/preferences/user-preferences-context.js";
import { HelpCenter, SafeMarkdown } from "../src/help/help-center.js";

function renderHelp(locale: LocalePreference = "zh-CN"): void {
  const settings = {
    ...createRuntimeSettingsStub().settings,
    load: async () => ({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        locale,
      },
      warning: null,
    }),
  };

  render(
    <UserPreferencesProvider settings={settings}>
      <AppMessagesProvider>
        <MemoryRouter initialEntries={["/help"]}>
          <HelpCenter />
        </MemoryRouter>
      </AppMessagesProvider>
    </UserPreferencesProvider>,
  );
}

describe("offline help center", () => {
  it("uses the persisted application language for one continuous manual", async () => {
    renderHelp("en-US");

    expect(
      await screen.findByRole("heading", { name: "DailyFlow User Manual" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Manual contents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Journals and Templates/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "English" })).not.toBeInTheDocument();
  });

  it("filters manual sections with help search", async () => {
    const user = userEvent.setup();
    renderHelp();

    await user.type(screen.getByRole("searchbox", { name: "搜索帮助" }), "结构化块");

    const directory = screen.getByRole("navigation", { name: "手册目录" });
    expect(within(directory).getByRole("button", { name: /每日日志与模板/u })).toBeInTheDocument();
    expect(
      within(directory).queryByRole("button", { name: /数据、备份与恢复/u }),
    ).not.toBeInTheDocument();
  });

  it("renders safe headings, grouped lists, and local anchors", () => {
    render(
      <MemoryRouter>
        <SafeMarkdown>
          {[
            "## Section One {#section-one}",
            "",
            "### Detail",
            "",
            "- First",
            "- Second",
            "",
            "[Jump to section](#section-one)",
            "<script>alert('unsafe')</script>",
            "[内部日志](/journal/2026-11-06)",
            "[不安全链接](javascript:alert('unsafe'))",
            "[项目仓库](https://github.com/xiaoweizano/DailyFlow)",
            "[相似仓库链接](https://github.com/xiaoweizano/DailyFlow-evil)",
            "[未授权外链](https://example.com/unsafe)",
          ].join("\n\n")}
        </SafeMarkdown>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Section One" })).toHaveAttribute(
      "id",
      "section-one",
    );
    expect(screen.getByRole("list").querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Jump to section" })).toHaveAttribute(
      "href",
      "#section-one",
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "内部日志" })).toHaveAttribute(
      "href",
      "/journal/2026-11-06",
    );
    expect(screen.queryByRole("link", { name: "不安全链接" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "项目仓库" })).toHaveAttribute(
      "href",
      "https://github.com/xiaoweizano/DailyFlow",
    );
    expect(screen.queryByRole("link", { name: "相似仓库链接" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "未授权外链" })).not.toBeInTheDocument();
  });
});

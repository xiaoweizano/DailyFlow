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
  it("starts with topics and opens one complete guide chapter", async () => {
    const user = userEvent.setup();
    renderHelp();

    expect(await screen.findByRole("heading", { name: "DailyFlow 帮助中心" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜索帮助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /创建并编辑每日日志/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /创建、完成和重新打开待办/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /使用时间线/u })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /创建、完成和重新打开待办/u }));

    expect(screen.getByRole("heading", { name: "待办：创建、完成与重新打开" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /待办完成和重新打开按钮/u })).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "本章目录" })).getByRole("link", {
        name: /完成与重新打开/u,
      }),
    ).toHaveAttribute("href", "#tasks-section-2");

    await user.click(screen.getByRole("button", { name: "放大查看截图" }));
    expect(screen.getByRole("dialog", { name: /待办完成和重新打开按钮/u })).toBeInTheDocument();
  });

  it("searches topics and opens the matching chapter", async () => {
    const user = userEvent.setup();
    renderHelp();

    await user.type(await screen.findByRole("searchbox", { name: "搜索帮助" }), "重新打开");

    expect(screen.getByText("2 条匹配结果")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /创建、完成和重新打开待办/u }));

    expect(screen.getByRole("heading", { name: "待办：创建、完成与重新打开" })).toBeInTheDocument();
  });

  it("keeps the consolidated manual available offline", async () => {
    const user = userEvent.setup();
    renderHelp();

    await user.click(await screen.findByRole("link", { name: "查看完整手册" }));

    expect(screen.getByRole("heading", { name: "创建并编辑每日日志" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "使用时间线" })).toBeInTheDocument();
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

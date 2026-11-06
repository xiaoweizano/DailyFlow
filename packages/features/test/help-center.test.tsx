// @vitest-environment jsdom

import "./setup-dom.js";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HelpCenter, SafeMarkdown } from "../src/help/help-center.js";

function renderHelp(): void {
  render(
    <MemoryRouter initialEntries={["/help"]}>
      <HelpCenter />
    </MemoryRouter>,
  );
}

describe("offline help center", () => {
  it("switches between Chinese and English documentation", async () => {
    const user = userEvent.setup();
    renderHelp();

    expect(screen.getByRole("heading", { name: "DailyFlow 帮助中心" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快速开始" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByRole("heading", { name: "DailyFlow Help Center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quick Start" })).toBeInTheDocument();
  });

  it("filters the offline table of contents with help search", async () => {
    const user = userEvent.setup();
    renderHelp();

    await user.type(screen.getByRole("searchbox", { name: "搜索帮助" }), "结构化块");

    const directory = screen.getByRole("navigation", { name: "帮助目录" });
    expect(within(directory).getByRole("button", { name: /每日日志/u })).toBeInTheDocument();
    expect(within(directory).queryByRole("button", { name: /数据管理/u })).not.toBeInTheDocument();
  });

  it("only renders safe internal and allowlisted external links", () => {
    render(
      <MemoryRouter>
        <SafeMarkdown>
          {[
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

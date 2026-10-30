import { describe, expect, it } from "vitest";

import { createSearchBigrams, normalizeSearchText } from "../src/index.js";

describe("normalizeSearchText", () => {
  it("applies NFKC, lowercases ASCII, and collapses whitespace", () => {
    expect(normalizeSearchText("  ＤailyFlow\t  Database   Query  ")).toBe(
      "dailyflow database query",
    );
  });

  it("normalizes punctuation without destroying code identifiers", () => {
    expect(normalizeSearchText("WebView2 启动失败：ERR_CONNECTION_RESET")).toBe(
      "webview2 启动失败 err_connection_reset",
    );
    expect(normalizeSearchText("C++ / a.b: 错误")).toBe("c++ / a.b 错误");
  });

  it("removes control characters", () => {
    expect(normalizeSearchText("排查\u0000数据库\u0007连接")).toBe("排查数据库连接");
  });
});

describe("createSearchBigrams", () => {
  it("creates deterministic overlapping bigrams for each CJK run", () => {
    expect(createSearchBigrams("排查数据库连接超时")).toEqual([
      "排查",
      "查数",
      "数据",
      "据库",
      "库连",
      "连接",
      "接超",
      "超时",
    ]);
  });

  it("splits CJK runs and ignores non-CJK text", () => {
    expect(createSearchBigrams("修复 WebView2 启动失败，然后验证 ERR_404")).toEqual([
      "修复",
      "启动",
      "动失",
      "失败",
      "然后",
      "后验",
      "验证",
    ]);
  });
});

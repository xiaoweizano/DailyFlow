import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import {
  installTxtImportFixture,
  installBrowserDownloadFallback,
} from "./fixtures/import-directory.js";
import { seedJournal } from "./fixtures/seed.js";

test("previews and imports UTF-8, UTF-8 BOM, GB18030, conflict, and invalid TXT files", async ({
  page,
}) => {
  await installTxtImportFixture(page);
  await page.goto("/data/import");

  await seedJournal(page, {
    date: "2026-10-03",
    title: "Existing conflict journal",
    text: "已有日志内容",
  });

  await page.getByRole("button", { name: "选择 TXT 目录" }).click();
  await expect(page.getByRole("heading", { name: "DailyFlowHistory" })).toBeVisible();
  await page.getByRole("button", { name: "扫描并生成预览" }).click();

  const table = page.getByRole("table", { name: "TXT 导入预览" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row", { name: /202504\/20250403\.txt/ })).toContainText("UTF-8");
  await expect(table.getByRole("row", { name: /202504\/20250404\.txt/ })).toContainText(
    "UTF-8 BOM",
  );
  await expect(table.getByRole("row", { name: /202505\/20250506\.txt/ })).toContainText("GB18030");
  await expect(table.getByRole("row", { name: /202504\/notes\.txt/ })).toContainText("异常");
  await expect(table.getByRole("row", { name: /202610\/20261003\.txt/ })).toContainText(
    "同日期已有日志",
  );

  await page.getByRole("button", { name: "进入导入策略" }).click();
  await page.getByRole("radio", { name: "同日期内容建立新版本" }).check();
  await page.getByRole("button", { name: "确认导入 4 个文件" }).click();

  await expect(page.getByRole("heading", { name: "导入完成" })).toBeVisible();
  await expect(page.getByLabel("导入结果统计")).toContainText("创建 4");
  await expect(page.getByLabel("导入结果统计")).toContainText("异常 1");

  await page.goto("/journal/2025-04-03");
  await expect(page.getByLabel("日志正文")).toContainText("UTF-8 工作记录");
  await page.goto("/journal/2025-04-04");
  await expect(page.getByLabel("日志正文")).toContainText("BOM 工作记录");
  await page.goto("/journal/2025-05-06");
  await expect(page.getByLabel("日志正文")).toContainText("中文工作记录");
});

test("exports a portable ZIP through the browser download fallback", async ({ page }) => {
  await installBrowserDownloadFallback(page);
  await page.goto("/data/export");
  await seedJournal(page, {
    date: "2026-11-04",
    title: "Export fixture",
    text: "可导出的工作记录",
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "生成并保存导出" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^dailyflow-export-.*\.zip$/u);
  await expect(page.getByRole("heading", { name: "导出已保存" })).toBeVisible();
});

test("imports rich Markdown into a journal and exports it back as a Markdown file", async ({
  page,
}) => {
  const source = [
    "# 故障复盘",
    "",
    "排查步骤：",
    "",
    "- 检查数据库连接",
    "- 查看服务日志",
    "",
    "最终 **恢复服务**。",
    "",
  ].join("\n");

  await page.goto("/journal/2026-11-04");
  await page.getByLabel("导入 Markdown 文件").setInputFiles({
    name: "incident.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(source, "utf8"),
  });

  const editor = page.getByLabel("日志正文");
  await expect(editor.locator("h1")).toHaveText("故障复盘");
  await expect(editor.locator("li")).toHaveCount(2);
  await expect(editor.locator("strong")).toHaveText("恢复服务");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("dailyflow-journal.md");

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = await readFile(downloadPath!, "utf8");
  expect(exported).toContain("# 故障复盘");
  expect(exported).toContain("- 检查数据库连接");
  expect(exported).toContain("**恢复服务**");
});

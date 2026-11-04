import { expect, test } from "@playwright/test";

import { installBrowserDownloadFallback } from "./fixtures/import-directory.js";
import { readJournalTitle, seedJournal } from "./fixtures/seed.js";

test("creates a complete backup archive", async ({ page }) => {
  await installBrowserDownloadFallback(page);
  await page.goto("/data/backup");
  await seedJournal(page, {
    date: "2026-11-04",
    title: "Backup fixture",
    text: "需要进入完整备份的数据",
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "创建完整备份" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^dailyflow-backup-.*\.zip$/u);
  await expect(page.getByRole("heading", { name: "备份已保存" })).toBeVisible();
});

test("rejects an invalid backup without replacing existing data", async ({ page }) => {
  await page.goto("/data/backup");
  await seedJournal(page, {
    date: "2026-11-04",
    title: "Preserve on invalid restore",
    text: "无效备份不能覆盖这条记录",
  });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "选择备份文件" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip"),
  });

  await expect(page.getByRole("alert")).toContainText("备份文件校验失败");
  await expect(
    page.getByRole("checkbox", { name: "我已确认将用此备份替换当前本地数据" }),
  ).toHaveCount(0);
  expect(await readJournalTitle(page, "2026-11-04")).toBe("Preserve on invalid restore");
});

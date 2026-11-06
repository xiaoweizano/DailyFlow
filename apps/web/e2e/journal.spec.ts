import { expect, test } from "@playwright/test";

import { todayInShanghai } from "./fixtures/seed.js";

test("opens the personal dashboard on first launch", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "工作台", level: 1 })).toBeVisible();
  await expect(page.getByText("今天还没有记录")).toBeVisible();
  await expect(
    page.locator("#main-workspace").getByRole("link", { name: "打开今日日志" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
});

test("autosaves after 800ms, persists after reload, and restores a history version", async ({
  page,
}) => {
  await page.goto("/journal/2026-11-04");

  await expect(page.getByLabel("日志标题")).toBeVisible();
  await page.getByLabel("日志标题").fill("Task 23 journal workflow");
  await expect(page.getByRole("status").filter({ hasText: "有未保存更改" })).toBeVisible();

  const saveStartedAt = await page.evaluate(() => performance.now());
  const editor = page.getByLabel("日志正文");
  await editor.click();
  await page.keyboard.type("自动保存后的日志正文");

  await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible({
    timeout: 5_000,
  });
  const saveElapsed = await page.evaluate(
    (startedAt) => performance.now() - startedAt,
    saveStartedAt,
  );
  expect(saveElapsed).toBeGreaterThanOrEqual(700);

  await page.reload();

  await expect(page.getByLabel("日志标题")).toHaveValue("Task 23 journal workflow");
  await expect(page.getByLabel("日志正文")).toContainText("自动保存后的日志正文");

  await page.getByLabel("日志标题").fill("Task 23 first explicit revision");
  await page.getByRole("button", { name: "立即保存" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible();

  await page.getByLabel("日志标题").fill("Task 23 second revision");
  await page.getByRole("button", { name: "立即保存" }).click();
  await expect(page.getByLabel("日志标题")).toHaveValue("Task 23 second revision");

  await page.getByRole("button", { name: "历史" }).click();
  const history = page.getByLabel("日志历史版本");
  await expect(history).toBeVisible();
  await history.getByRole("button", { name: /版本 2/ }).click();
  await expect(history.getByLabel("版本 2 预览")).toContainText("自动保存后的日志正文");
  await history.getByRole("button", { name: "恢复此版本" }).click();

  await expect(page.getByLabel("日志标题")).toHaveValue("Task 23 first explicit revision");
  await expect(page.getByLabel("日志正文")).toContainText("自动保存后的日志正文");
});

test("supports the date navigator and explicit keyboard save", async ({ page }) => {
  await page.goto(`/journal/${todayInShanghai()}`);
  await page.getByLabel("日志标题").fill("Keyboard save");
  await page.getByLabel("日志正文").click();
  await page.keyboard.type("使用快捷键立即保存");
  await page.keyboard.press("ControlOrMeta+S");

  await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible();
  await expect(page.getByLabel("选择日志日期")).toHaveValue(todayInShanghai());
  await page.getByRole("button", { name: "前一天" }).click();
  await expect(page.getByLabel("选择日志日期")).not.toHaveValue(todayInShanghai());
});

test("autolinks typed URLs and preserves the link after saving", async ({ page }) => {
  await page.goto("/journal/2026-11-04");

  const editor = page.getByLabel("日志正文");
  await editor.click();
  await page.keyboard.type("参考资料 https://example.com/docs ");

  const link = editor.locator('a[href="https://example.com/docs"]');
  await expect(link).toHaveText("https://example.com/docs");
  await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible({
    timeout: 5_000,
  });

  await page.reload();
  await expect(
    page.getByLabel("日志正文").locator('a[href="https://example.com/docs"]'),
  ).toHaveText("https://example.com/docs");
});

test("converts Markdown heading shortcuts while typing", async ({ page }) => {
  await page.goto("/journal/2026-11-04");

  const editor = page.getByLabel("日志正文");
  await editor.click();
  await page.keyboard.type("## ");
  await expect(editor.locator("h2")).toBeVisible();

  await page.keyboard.type("问题排查");
  await expect(editor.locator("h2")).toHaveText("问题排查");
});

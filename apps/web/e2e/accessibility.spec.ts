import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { chooseBlankJournal } from "./fixtures/seed.js";

const routes = [
  "/",
  "/journal/2026-11-04",
  "/timeline",
  "/knowledge",
  "/tasks",
  "/search",
  "/analytics",
  "/data",
  "/settings",
] as const;

async function expectNoBlockingViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blockingViolations = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  expect(blockingViolations, `${context}\n${JSON.stringify(blockingViolations, null, 2)}`).toEqual(
    [],
  );
}

test("has no serious or critical axe violations on primary routes", async ({ page }) => {
  test.setTimeout(90_000);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("#main-workspace h1").first()).toBeVisible();

    await expectNoBlockingViolations(page, route);
  }
});

test("has no serious or critical axe violations in settings sections and annual heatmap", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/settings");
  for (const tabName of ["常规", "外观", "编辑器", "数据", "关于"]) {
    const tab = page.getByRole("tab", { name: tabName });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expectNoBlockingViolations(page, `/settings#${tabName}`);
  }

  await page.goto("/timeline");
  await page.getByRole("button", { name: "热力图", exact: true }).click();
  await expect(page.getByRole("grid", { name: /年全年日志热力图/u })).toBeVisible();
  await expectNoBlockingViolations(page, "/timeline#heatmap");
});

test("runs the core workflow from the keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "工作台", level: 1 })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "主导航" });
  await navigation.getByRole("link", { name: "每日日志" }).focus();
  await page.keyboard.press("Enter");
  await chooseBlankJournal(page, { keyboard: true });

  await expect(page.getByLabel("日志标题")).toBeVisible();
  await page.getByLabel("日志标题").focus();
  await page.keyboard.type("Keyboard workflow journal");
  await page.getByLabel("日志正文").focus();
  await page.keyboard.type("Created and saved without pointer input.");
  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible();

  const search = page.getByRole("search");
  await search.getByLabel("搜索日志、知识和任务").focus();
  await page.keyboard.type("keyboard workflow");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=keyboard(?:\+|%20)workflow/u);

  await navigation.getByRole("link", { name: "待办" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "待办", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "全部" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "新建待办" }).focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "新建待办" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("Keyboard-only task");
  await dialog.getByRole("button", { name: "创建待办" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "待办：Keyboard-only task" })).toBeVisible();

  await navigation.getByRole("link", { name: "数据" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "数据管理", level: 1 })).toBeVisible();
});

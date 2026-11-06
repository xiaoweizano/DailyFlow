import { expect, test } from "@playwright/test";

import { seedSearchFixture, todayInShanghai } from "./fixtures/seed.js";

const fixture = {
  get date() {
    return todayInShanghai();
  },
  term: "DailyFlow检索锚点",
  journalTitle: "搜索日志条目",
  knowledgeTitle: "搜索结果与经验",
  taskTitle: "搜索后续待办",
};

test("searches journals, knowledge, and tasks through a rebuilt shared index", async ({ page }) => {
  await page.goto("/");
  await seedSearchFixture(page, fixture);
  await page.goto(`/search?q=${encodeURIComponent(fixture.term)}`);

  await expect(page.getByRole("heading", { name: "全局搜索" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(fixture.journalTitle) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(fixture.knowledgeTitle) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(fixture.taskTitle) })).toBeVisible();
  await expect(page.getByText("索引已就绪")).toBeVisible();
});

test("renders calendar, timeline, and activity heatmap views", async ({ page }) => {
  await page.goto("/");
  await seedSearchFixture(page, fixture);
  await page.goto("/timeline");

  await expect(page.getByRole("group", { name: "时间视图" })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `${fixture.date}，1 篇日志，1 个任务到期`,
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "时间线", exact: true }).click();
  await expect(page.getByRole("heading", { name: "最近记录" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: `${fixture.journalTitle} ${fixture.date}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "热力图", exact: true }).click();
  await expect(
    page.getByRole("grid", { name: `${fixture.date.slice(0, 4)} 年全年日志热力图` }),
  ).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: `${fixture.date}，1 篇日志，1 个任务到期` }),
  ).toBeVisible();
});

test("keeps annual heatmap context visible while cells scroll on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/timeline");
  await page.getByRole("button", { name: "热力图", exact: true }).click();

  const grid = page.getByRole("grid", {
    name: `${fixture.date.slice(0, 4)} 年全年日志热力图`,
  });
  await expect(grid).toBeVisible();
  await expect(page.getByText("周一", { exact: true })).toBeVisible();
  await expect(page.getByText("1 月", { exact: true })).toBeVisible();

  const scrollMetrics = await grid.evaluate((element) => {
    let container = element.parentElement;
    while (container !== null && getComputedStyle(container).overflowX !== "auto") {
      container = container.parentElement;
    }
    return container === null
      ? null
      : { clientWidth: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(scrollMetrics).not.toBeNull();
  expect(scrollMetrics?.scrollWidth).toBeGreaterThan(scrollMetrics?.clientWidth ?? 0);
});

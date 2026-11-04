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
  await expect(page.getByRole("list", { name: "过去 12 周活动热力图" })).toBeVisible();
  await expect(
    page.getByRole("listitem", { name: `${fixture.date}，1 篇日志，1 个任务到期` }),
  ).toBeVisible();
});

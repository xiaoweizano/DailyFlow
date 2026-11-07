import { expect, test } from "@playwright/test";

import { chooseBlankJournal } from "./fixtures/seed.js";

test("creates a dated task and promotes its journal into the knowledge base", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("group", { name: "待办视图" }).getByRole("button", { name: "全部" }).click();
  await page.getByRole("button", { name: "新建待办" }).click();

  const taskDialog = page.getByRole("dialog", { name: "新建待办" });
  await taskDialog.getByLabel("任务标题").fill("发布候选");
  const dueDate = taskDialog.getByLabel("待办截止日期");
  await expect(dueDate).toHaveAttribute("type", "date");
  await dueDate.fill("2026-11-05");
  await taskDialog.getByRole("button", { name: "创建待办" }).click();

  const task = page.getByRole("article", { name: "待办：发布候选" });
  await expect(task).toBeVisible();
  await expect(task).toContainText("2026-11-05");

  await page.goto("/journal/2026-11-05");
  await chooseBlankJournal(page);
  await page.getByLabel("日志标题").fill("发布候选复盘");
  await page.getByLabel("日志正文").click();
  await page.keyboard.type("记录发布候选的验证过程与最终结论。");
  await page.getByRole("button", { name: "立即保存" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible();

  await page.getByRole("button", { name: "沉淀整篇日志" }).click();
  const promotionDialog = page.getByRole("dialog", { name: "保存为知识" });
  await promotionDialog.getByLabel("知识标题").fill("发布候选复盘知识");
  await promotionDialog.getByRole("button", { name: "保存到知识库" }).click();

  await page.getByRole("link", { name: "打开知识项" }).click();
  await expect(page.getByRole("heading", { name: "发布候选复盘知识", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "原始日志 · 2026-11-05" })).toBeVisible();
});

test("restores an unsaved report draft after leaving and returning to its period", async ({
  page,
}) => {
  const title = "2026 年第 45 周复盘";
  const body = "这段报告尚未保存，切换周期后应保留在草稿中。";

  await page.goto("/analytics/week/2026-11-05?report=1");
  const reportTitle = page.getByLabel("报告标题");
  await expect(reportTitle).toBeVisible();
  await reportTitle.fill(title);

  const reportBody = page.getByLabel("报告正文");
  await reportBody.click();
  await page.keyboard.type(body);

  const period = page.getByRole("group", { name: "统计周期" });
  await period.getByRole("button", { name: "月" }).click();
  await expect(page).toHaveURL(/\/analytics\/month\//u);
  await expect(page.getByLabel("报告标题")).not.toHaveValue(title);

  await period.getByRole("button", { name: "周" }).click();
  await expect(page).toHaveURL(/\/analytics\/week\/2026-11-02/u);
  await expect(page.getByLabel("报告标题")).toHaveValue(title);
  await expect(page.getByLabel("报告正文")).toContainText(body);
});

import { expect, test } from "@playwright/test";

test("exposes the test-only runtime bridge for public application use cases", async ({ page }) => {
  await page.goto("/");

  const bridge = await page.evaluate(() => {
    const runtime = window.__DAILYFLOW_E2E__;
    return {
      available: runtime !== undefined,
      journal: typeof runtime?.journal?.get,
      tasks: typeof runtime?.tasks?.create,
      knowledge: typeof runtime?.knowledge?.promote,
      search: typeof runtime?.search?.query,
      searchRebuild: typeof runtime?.search?.rebuild,
    };
  });

  expect(bridge).toEqual({
    available: true,
    journal: "function",
    tasks: "function",
    knowledge: "function",
    search: "function",
    searchRebuild: "function",
  });
});

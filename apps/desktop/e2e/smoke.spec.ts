import { chromium, expect, test, type Browser, type Page } from "@playwright/test";

const webview2Url = process.env.TAURI_WEBVIEW2_CDP_URL;
const smokeRunId = process.env.DAILYFLOW_SMOKE_RUN_ID ?? "desktop-smoke";
const smokeTitle = `桌面冒烟 ${smokeRunId}`;
const smokeBody = `问题记录 ${smokeRunId}`;

test.setTimeout(90_000);

async function findApplicationPage(browser: Browser): Promise<Page | null> {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => !candidate.url().startsWith("devtools://"));

  return page ?? null;
}

async function waitForApplicationPage(browser: Browser): Promise<Page> {
  await expect
    .poll(
      async () => {
        const page = await findApplicationPage(browser);
        if (page === null) {
          return null;
        }

        try {
          return await page.evaluate(() => ({
            readyState: document.readyState,
            rootCount: document.querySelectorAll("#root").length,
            title: document.title,
          }));
        } catch {
          // The initial WebView2 host page is replaced by the Tauri document.
          return null;
        }
      },
      { intervals: [250, 500, 1_000], timeout: 60_000 },
    )
    .toEqual({
      readyState: "complete",
      rootCount: 1,
      title: "DailyFlow",
    });

  const page = await findApplicationPage(browser);
  expect(page).not.toBeNull();
  await expect(page!.locator("#root")).toBeAttached();
  return page!;
}

async function navigateTo(page: Page, hash: string): Promise<void> {
  await page.evaluate((targetHash) => {
    window.location.hash = targetHash;
  }, hash);
}

async function invokeLifecycle(page: Page, command: string): Promise<void> {
  await page.evaluate(async (commandName) => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;

    await internals.invoke(commandName);
  }, command);
}

test("persists journal, settings, and desktop lifecycle", async () => {
  test.skip(
    webview2Url === undefined,
    "SKIP: TAURI_WEBVIEW2_CDP_URL is not configured; run scripts/run-desktop-smoke.ps1.",
  );

  const browser = await chromium.connectOverCDP(webview2Url, {
    timeout: 30_000,
  });

  try {
    const page = await waitForApplicationPage(browser);

    await navigateTo(page, "#/journal/2026-11-05");
    const title = page.getByLabel("日志标题");
    const body = page.getByLabel("日志正文");
    await expect(title).toBeVisible();
    await expect(body).toBeVisible();
    await title.fill(smokeTitle);
    await body.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(smokeBody);
    await page.getByRole("button", { name: "立即保存" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^已保存/ })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("日志标题")).toHaveValue(smokeTitle);
    await expect(page.getByLabel("日志正文")).toContainText(smokeBody);

    await navigateTo(page, "#/settings");
    await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
    await page.getByRole("tab", { name: "外观" }).click();
    const darkTheme = page
      .getByRole("group", { name: "主题" })
      .getByRole("button", { name: "深色" });
    await darkTheme.click();
    await expect(darkTheme).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByRole("status").filter({ hasText: "设置已保存" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
    await page.getByRole("tab", { name: "外观" }).click();
    await expect(
      page.getByRole("group", { name: "主题" }).getByRole("button", { name: "深色" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");

    await invokeLifecycle(page, "lifecycle_hide_to_tray");
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");

    await invokeLifecycle(page, "lifecycle_quit").catch(() => {
      // The app can close the IPC connection before acknowledging the exit command.
    });
    await expect.poll(() => browser.isConnected(), { timeout: 15_000 }).toBe(false);
  } finally {
    if (browser.isConnected()) {
      await browser.close().catch(() => undefined);
    }
  }
});

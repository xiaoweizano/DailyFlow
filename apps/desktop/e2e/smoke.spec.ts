import { chromium, expect, test } from "@playwright/test";

const webview2Url = process.env.TAURI_WEBVIEW2_CDP_URL;

test.setTimeout(90_000);

test("launches the packaged Tauri shell", async () => {
  test.skip(
    webview2Url === undefined,
    "SKIP: TAURI_WEBVIEW2_CDP_URL is not configured; run scripts/run-desktop-smoke.ps1.",
  );

  const browser = await chromium.connectOverCDP(webview2Url, {
    timeout: 30_000,
  });

  try {
    await expect
      .poll(
        async () => {
          const page = browser
            .contexts()
            .flatMap((context) => context.pages())
            .find((candidate) => !candidate.url().startsWith("devtools://"));
          if (page === undefined) {
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

    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => !candidate.url().startsWith("devtools://"));
    expect(page).toBeDefined();
    await expect(page!.locator("#root")).toBeAttached();
  } finally {
    await browser.close();
  }
});

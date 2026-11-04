import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";

export default defineConfig({
  testDir: "./apps",
  testMatch: ["web/e2e/**/*.spec.ts", "desktop/e2e/**/*.spec.ts"],
  fullyParallel: false,
  forbidOnly: isCi,
  retries: 0,
  workers: isCi ? 1 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /desktop\/e2e/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "firefox",
      testIgnore: /desktop\/e2e/,
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit",
      testIgnore: /desktop\/e2e/,
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "windows-desktop",
      testMatch: /desktop\/e2e/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: undefined,
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @dailyflow/web dev --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !isCi,
    timeout: 120_000,
    env: {
      VITE_E2E: "true",
    },
  },
});

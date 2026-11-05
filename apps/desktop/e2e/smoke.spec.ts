import { expect, test } from "@playwright/test";

const webdriverUrl = process.env.TAURI_WEBDRIVER_URL;
const applicationPath = process.env.TAURI_APP_PATH;

test.setTimeout(90_000);

test("launches the packaged Tauri shell", async ({ request }) => {
  test.skip(
    webdriverUrl === undefined,
    "SKIP: TAURI_WEBDRIVER_URL is not configured; install tauri-driver and set the application path.",
  );
  expect(
    applicationPath,
    "TAURI_APP_PATH is required when TAURI_WEBDRIVER_URL is set",
  ).toBeTruthy();

  const response = await request.post(`${webdriverUrl}/session`, {
    data: {
      capabilities: {
        alwaysMatch: {
          browserName: "wry",
          "tauri:options": {
            application: applicationPath,
          },
        },
      },
    },
    timeout: 60_000,
  });
  expect(response.ok(), await response.text()).toBe(true);

  const session = (await response.json()) as { value?: { sessionId?: string } };
  const sessionId = session.value?.sessionId;
  expect(sessionId).toBeTruthy();

  try {
    const titleResponse = await request.get(`${webdriverUrl}/session/${sessionId}/title`);
    expect(titleResponse.ok(), await titleResponse.text()).toBe(true);
    const title = (await titleResponse.json()) as { value?: string };
    expect(title.value).toBe("DailyFlow");

    const sourceResponse = await request.get(`${webdriverUrl}/session/${sessionId}/source`);
    expect(sourceResponse.ok(), await sourceResponse.text()).toBe(true);
    const source = (await sourceResponse.json()) as { value?: string };
    expect(source.value).toContain('id="root"');
  } finally {
    await request.delete(`${webdriverUrl}/session/${sessionId}`);
  }
});

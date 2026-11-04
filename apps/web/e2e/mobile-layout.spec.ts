import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "phone", width: 375, height: 812 },
  { name: "compact-desktop", width: 1024, height: 700 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const routes = ["/", "/journal/2026-11-04", "/timeline", "/tasks", "/data"] as const;

async function expectNoLayoutOverflow(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const rectangle = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) {
        return null;
      }
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };

    const topbar = document.querySelector<HTMLElement>(".df-main > header");
    const topbarChildren =
      topbar === null
        ? []
        : [...topbar.children]
            .filter((element) => element.getBoundingClientRect().width > 0)
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
              };
            });

    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
      shell: rectangle(".df-shell"),
      sidebar: rectangle(".df-sidebar"),
      main: rectangle(".df-main"),
      statusbar: rectangle(".df-statusbar"),
      heading: rectangle("#main-workspace h1"),
      topbarChildren,
    };
  });

  expect(layout.documentWidth, "document horizontal overflow").toBeLessThanOrEqual(
    layout.viewportWidth + 1,
  );
  expect(layout.bodyWidth, "body horizontal overflow").toBeLessThanOrEqual(
    layout.viewportWidth + 1,
  );
  expect(layout.shell).not.toBeNull();
  expect(layout.sidebar).not.toBeNull();
  expect(layout.main).not.toBeNull();
  expect(layout.statusbar).not.toBeNull();
  expect(layout.heading).not.toBeNull();

  const { sidebar, main, statusbar, heading, topbarChildren } = layout;
  expect(sidebar!.right, "sidebar overlaps main").toBeLessThanOrEqual(main!.left + 1);
  expect(statusbar!.left, "statusbar overlaps sidebar").toBeGreaterThanOrEqual(sidebar!.right - 1);
  expect(heading!.left, "heading starts outside workspace").toBeGreaterThanOrEqual(main!.left - 1);
  expect(heading!.right, "heading exceeds workspace").toBeLessThanOrEqual(main!.right + 1);

  for (let leftIndex = 0; leftIndex < topbarChildren.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < topbarChildren.length; rightIndex += 1) {
      const left = topbarChildren[leftIndex]!;
      const right = topbarChildren[rightIndex]!;
      const horizontalOverlap = Math.min(left.right, right.right) - Math.max(left.left, right.left);
      const verticalOverlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
      expect(horizontalOverlap > 1 && verticalOverlap > 1, "topbar controls overlap").toBe(false);
    }
  }
}

for (const viewport of viewports) {
  test(`keeps the application usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("#main-workspace h1").first()).toBeVisible();
      await expectNoLayoutOverflow(page);
    }
  });
}

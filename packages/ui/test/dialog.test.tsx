// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "../src/index.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

describe("DialogContent", () => {
  it("supports an immersive surface without scrolling the dialog body", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Dialog open>
          <DialogContent size="immersive" scroll="none">
            <DialogTitle>知识编辑器</DialogTitle>
          </DialogContent>
        </Dialog>,
      );
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    if (dialog === null) {
      return;
    }
    expect(dialog.className).toContain("h-[86vh]");
    expect(dialog.className).toContain("max-h-[860px]");
    expect(dialog.className).toContain("w-[92vw]");
    expect(dialog.className).toContain("max-w-[1180px]");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).not.toContain("overflow-auto");

    await act(async () => {
      root.unmount();
    });
  });
});

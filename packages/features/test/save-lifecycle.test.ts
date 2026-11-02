import { describe, expect, it, vi } from "vitest";

import { createSaveLifecycle } from "../src/lifecycle/save-lifecycle.js";

describe("SaveLifecycle", () => {
  it("waits for every registered save handler", async () => {
    const lifecycle = createSaveLifecycle();
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);
    lifecycle.register(first);
    lifecycle.register(second);

    await expect(lifecycle.flushAll()).resolves.toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reports failure when any registered handler cannot save", async () => {
    const lifecycle = createSaveLifecycle();
    lifecycle.register(async () => false);

    await expect(lifecycle.flushAll()).resolves.toBe(false);
  });

  it("unregisters disposed editors", async () => {
    const lifecycle = createSaveLifecycle();
    const handler = vi.fn(async () => true);
    const unregister = lifecycle.register(handler);

    unregister();
    await lifecycle.flushAll();

    expect(handler).not.toHaveBeenCalled();
  });
});

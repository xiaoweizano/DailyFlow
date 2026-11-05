import { describe, expect, it, vi } from "vitest";

import {
  flushBeforeQuit,
  installCloseGuard,
  type CloseGuardWindow,
  type CloseRequestEvent,
} from "../src/desktop-close-guard.js";

type CloseHandler = (event: CloseRequestEvent) => void | Promise<void>;

function createWindow(): {
  readonly window: CloseGuardWindow;
  readonly preventDefault: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly getHandler: () => CloseHandler;
} {
  let handler: CloseHandler | undefined;
  const preventDefault = vi.fn();
  const close = vi.fn(async () => {
    await handler?.({ preventDefault });
  });
  const window: CloseGuardWindow = {
    onCloseRequested: async (nextHandler) => {
      handler = nextHandler;
      return () => undefined;
    },
    close,
  };

  return {
    window,
    preventDefault,
    close,
    getHandler: () => {
      if (handler === undefined) {
        throw new Error("close handler was not registered");
      }
      return handler;
    },
  };
}

describe("installCloseGuard", () => {
  it("hides to the tray without closing the window when close-to-tray is enabled", async () => {
    const hideToTray = vi.fn(async () => undefined);
    const lifecycle = {
      flushAll: vi.fn(async () => true),
      isCloseToTrayEnabled: () => true,
      hideToTray,
    };
    const harness = createWindow();
    await installCloseGuard(harness.window, lifecycle);

    const event = { preventDefault: vi.fn() };
    await harness.getHandler()(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(lifecycle.flushAll).toHaveBeenCalledOnce();
    expect(hideToTray).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });

  it("closes only after every pending save has flushed", async () => {
    const lifecycle = {
      flushAll: vi.fn(async () => true),
      isCloseToTrayEnabled: () => false,
      hideToTray: vi.fn(async () => undefined),
    };
    const harness = createWindow();
    await installCloseGuard(harness.window, lifecycle);

    const firstEvent = { preventDefault: vi.fn() };
    await harness.getHandler()(firstEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(lifecycle.flushAll).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledOnce();
    expect(harness.preventDefault).not.toHaveBeenCalled();
  });

  it("keeps the window open when flushing fails", async () => {
    const lifecycle = {
      flushAll: vi.fn(async () => false),
      isCloseToTrayEnabled: () => true,
      hideToTray: vi.fn(async () => undefined),
    };
    const harness = createWindow();
    await installCloseGuard(harness.window, lifecycle);

    const event = { preventDefault: vi.fn() };
    await harness.getHandler()(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });

  it("keeps the window open when the lifecycle rejects unexpectedly", async () => {
    const lifecycle = {
      flushAll: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      isCloseToTrayEnabled: () => true,
      hideToTray: vi.fn(async () => undefined),
    };
    const harness = createWindow();
    await installCloseGuard(harness.window, lifecycle);

    const event = { preventDefault: vi.fn() };
    await harness.getHandler()(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });
});

describe("flushBeforeQuit", () => {
  it("quits only after every pending save has flushed", async () => {
    const lifecycle = { flushAll: vi.fn(async () => true) };
    const quit = vi.fn(async () => undefined);

    await expect(flushBeforeQuit(lifecycle, quit)).resolves.toBe(true);

    expect(lifecycle.flushAll).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });

  it("does not quit when flushing fails", async () => {
    const lifecycle = { flushAll: vi.fn(async () => false) };
    const quit = vi.fn(async () => undefined);

    await expect(flushBeforeQuit(lifecycle, quit)).resolves.toBe(false);

    expect(quit).not.toHaveBeenCalled();
  });
});

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
  it("asks the renderer to confirm before closing when requested", async () => {
    const requestCloseConfirmation = vi.fn(async () => undefined);
    const lifecycle = {
      flushAll: vi.fn(async () => true),
      getCloseBehavior: () => "ask" as const,
      requestCloseConfirmation,
      hideToTray: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
    };
    const harness = createWindow();
    await installCloseGuard(harness.window, lifecycle);

    await harness.getHandler()({ preventDefault: vi.fn() });

    expect(requestCloseConfirmation).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });

  it("minimizes to the tray after pending saves flush", async () => {
    const hideToTray = vi.fn(async () => undefined);
    const lifecycle = {
      flushAll: vi.fn(async () => true),
      getCloseBehavior: () => "minimize" as const,
      requestCloseConfirmation: vi.fn(async () => undefined),
      hideToTray,
      quit: vi.fn(async () => undefined),
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

  it("quits only after every pending save has flushed", async () => {
    const quit = vi.fn(async () => undefined);
    const lifecycle = {
      flushAll: vi.fn(async () => true),
      getCloseBehavior: () => "quit" as const,
      requestCloseConfirmation: vi.fn(async () => undefined),
      hideToTray: vi.fn(async () => undefined),
      quit,
    };
    const harness = createWindow();
    await installCloseGuard(harness.window, lifecycle);

    const firstEvent = { preventDefault: vi.fn() };
    await harness.getHandler()(firstEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(lifecycle.flushAll).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
    expect(harness.preventDefault).not.toHaveBeenCalled();
  });

  it("keeps the window open when flushing fails", async () => {
    const lifecycle = {
      flushAll: vi.fn(async () => false),
      getCloseBehavior: () => "minimize" as const,
      requestCloseConfirmation: vi.fn(async () => undefined),
      hideToTray: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
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
      getCloseBehavior: () => "minimize" as const,
      requestCloseConfirmation: vi.fn(async () => undefined),
      hideToTray: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
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

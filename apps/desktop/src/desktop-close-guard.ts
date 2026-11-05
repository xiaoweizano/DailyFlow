export interface CloseRequestEvent {
  preventDefault: () => void;
}

export interface CloseGuardWindow {
  onCloseRequested: (
    handler: (event: CloseRequestEvent) => void | Promise<void>,
  ) => Promise<() => void>;
  close: () => Promise<void>;
}

export interface CloseGuardLifecycle {
  flushAll: () => Promise<boolean>;
  isCloseToTrayEnabled: () => boolean;
  hideToTray: () => Promise<void>;
}

export interface QuitLifecycle {
  flushAll: () => Promise<boolean>;
}

export async function flushBeforeQuit(
  lifecycle: QuitLifecycle,
  quit: () => Promise<void>,
): Promise<boolean> {
  try {
    if (!(await lifecycle.flushAll())) {
      return false;
    }
    await quit();
    return true;
  } catch {
    return false;
  }
}

export async function installCloseGuard(
  window: CloseGuardWindow,
  lifecycle: CloseGuardLifecycle,
): Promise<() => void> {
  let closing = false;

  return window.onCloseRequested(async (event) => {
    if (closing) {
      return;
    }

    event.preventDefault();

    let flushed = false;
    try {
      flushed = await lifecycle.flushAll();
    } catch {
      return;
    }

    if (!flushed) {
      return;
    }

    if (lifecycle.isCloseToTrayEnabled()) {
      closing = true;
      try {
        await lifecycle.hideToTray();
      } catch {
        closing = false;
      }
      return;
    }

    closing = true;
    try {
      await window.close();
    } catch {
      closing = false;
    }
  });
}

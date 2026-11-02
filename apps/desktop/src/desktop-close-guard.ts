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

    closing = true;
    try {
      await window.close();
    } catch {
      closing = false;
    }
  });
}

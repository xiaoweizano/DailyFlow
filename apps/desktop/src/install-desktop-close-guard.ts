import type { CloseBehavior } from "@dailyflow/application";
import type { SaveLifecycle } from "@dailyflow/features";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { requestCloseConfirmation } from "./close-confirmation-store.js";
import { flushBeforeQuit, installCloseGuard } from "./desktop-close-guard.js";

let closeBehavior: CloseBehavior = "ask";
let quitting = false;

export async function setDesktopCloseBehavior(behavior: CloseBehavior): Promise<void> {
  closeBehavior = behavior;
  await invoke("lifecycle_set_close_behavior", { behavior });
}

export async function installDesktopCloseGuard(
  lifecycle: Pick<SaveLifecycle, "flushAll">,
): Promise<() => void> {
  const uninstallCloseGuard = await installCloseGuard(getCurrentWindow(), {
    flushAll: lifecycle.flushAll,
    getCloseBehavior: () => closeBehavior,
    requestCloseConfirmation: async () => requestCloseConfirmation(),
    hideToTray: () => invoke("lifecycle_hide_to_tray"),
    quit: () => invoke("lifecycle_quit"),
  });
  const unlistenOpenSettings = await listen("dailyflow:open-settings", () => {
    window.location.hash = "#/settings";
  });
  const unlistenCloseRequested = await listen("dailyflow:close-requested", () => {
    requestCloseConfirmation();
  });
  const unlistenRequestQuit = await listen("dailyflow:request-quit", async () => {
    if (quitting) {
      return;
    }
    quitting = true;
    const didQuit = await flushBeforeQuit(lifecycle, () => invoke("lifecycle_quit"));
    if (!didQuit) {
      quitting = false;
    }
  });

  return () => {
    unlistenRequestQuit();
    unlistenCloseRequested();
    unlistenOpenSettings();
    uninstallCloseGuard();
  };
}

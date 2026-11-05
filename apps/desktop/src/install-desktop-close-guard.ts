import type { SaveLifecycle } from "@dailyflow/features";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { flushBeforeQuit, installCloseGuard } from "./desktop-close-guard.js";

let closeToTray = true;
let quitting = false;

export async function setDesktopCloseToTray(enabled: boolean): Promise<void> {
  closeToTray = enabled;
  await invoke("lifecycle_set_close_to_tray", { enabled });
}

export async function installDesktopCloseGuard(
  lifecycle: Pick<SaveLifecycle, "flushAll">,
): Promise<() => void> {
  const uninstallCloseGuard = await installCloseGuard(getCurrentWindow(), {
    flushAll: lifecycle.flushAll,
    isCloseToTrayEnabled: () => closeToTray,
    hideToTray: () => invoke("lifecycle_hide_to_tray"),
  });
  const unlistenOpenSettings = await listen("dailyflow:open-settings", () => {
    window.location.hash = "#/settings";
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
    unlistenOpenSettings();
    uninstallCloseGuard();
  };
}

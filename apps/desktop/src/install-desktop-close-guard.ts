import type { SaveLifecycle } from "@dailyflow/features";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { installCloseGuard } from "./desktop-close-guard.js";

export function installDesktopCloseGuard(
  lifecycle: Pick<SaveLifecycle, "flushAll">,
): Promise<() => void> {
  return installCloseGuard(getCurrentWindow(), lifecycle);
}

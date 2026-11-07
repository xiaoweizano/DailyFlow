import { DisabledAiRegistry } from "@dailyflow/ai";
import { createAppRuntimeServices, type AppRuntimeServices } from "@dailyflow/features";
import { createDesktopServices, type TauriListen } from "@dailyflow/infrastructure/desktop";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { setDesktopCloseBehavior } from "./install-desktop-close-guard.js";

const listenToTauriEvent: TauriListen = async <T>(event: string, handler: (payload: T) => void) =>
  await listen<T>(event, ({ payload }) => {
    handler(payload);
  });

const storageServices = createDesktopServices({
  searchProgressListener: listenToTauriEvent,
});
const { secretStore, settingsStore, ...storagePorts } = storageServices;

export const desktopServices: AppRuntimeServices = createAppRuntimeServices({
  ...storagePorts,
  settingsStore,
  secretStore,
  aiProviderRegistry: new DisabledAiRegistry(),
  applyRuntimePreferences: async (preferences) => {
    await setDesktopCloseBehavior(preferences.closeBehavior);
    await invoke("desktop_apply_startup_preferences", {
      autostart: preferences.autostart,
    });
  },
});

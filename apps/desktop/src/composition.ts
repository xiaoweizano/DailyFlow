import { createAppRuntimeServices, type AppRuntimeServices } from "@dailyflow/features";
import { createDesktopServices, type TauriListen } from "@dailyflow/infrastructure/desktop";
import { listen } from "@tauri-apps/api/event";

const listenToTauriEvent: TauriListen = async <T>(event: string, handler: (payload: T) => void) =>
  await listen<T>(event, ({ payload }) => {
    handler(payload);
  });

const storageServices = createDesktopServices({
  searchProgressListener: listenToTauriEvent,
});

export const desktopServices: AppRuntimeServices = createAppRuntimeServices(storageServices);

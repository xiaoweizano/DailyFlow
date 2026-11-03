import { DisabledAiRegistry } from "@dailyflow/ai";
import { createAppRuntimeServices, type AppRuntimeServices } from "@dailyflow/features";
import { createWebServices } from "@dailyflow/infrastructure/web";

const storageServices = createWebServices();
const { secretStore, settingsStore, ...storagePorts } = storageServices;

export const webServices: AppRuntimeServices = createAppRuntimeServices({
  ...storagePorts,
  settingsStore,
  secretStore,
  aiProviderRegistry: new DisabledAiRegistry(),
});

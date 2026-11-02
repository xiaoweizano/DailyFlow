import { createAppRuntimeServices, type AppRuntimeServices } from "@dailyflow/features";
import { createDesktopServices } from "@dailyflow/infrastructure/desktop";

const storageServices = createDesktopServices();

export const desktopServices: AppRuntimeServices = createAppRuntimeServices(storageServices);

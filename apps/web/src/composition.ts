import { createAppRuntimeServices, type AppRuntimeServices } from "@dailyflow/features";
import { createWebServices } from "@dailyflow/infrastructure/web";

const storageServices = createWebServices();

export const webServices: AppRuntimeServices = createAppRuntimeServices(storageServices);

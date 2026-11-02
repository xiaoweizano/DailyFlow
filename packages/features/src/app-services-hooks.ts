import { useContext } from "react";

import { AppServicesContext, type AppRuntimeServices } from "./app-services-context.js";

export function useAppServices(): AppRuntimeServices {
  const services = useContext(AppServicesContext);
  if (services === null) {
    throw new Error("DailyFlow application services are not available");
  }

  return services;
}

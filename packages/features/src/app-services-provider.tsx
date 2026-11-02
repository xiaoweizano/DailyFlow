import type { ReactNode } from "react";

import { AppServicesContext, type AppRuntimeServices } from "./app-services-context.js";

export interface AppServicesProviderProps {
  readonly services: AppRuntimeServices;
  readonly children: ReactNode;
}

export function AppServicesProvider({
  services,
  children,
}: AppServicesProviderProps): React.JSX.Element {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

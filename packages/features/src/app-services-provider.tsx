import type { ReactNode } from "react";

import { AppServicesContext, type AppRuntimeServices } from "./app-services-context.js";
import { AppMessagesProvider } from "./preferences/app-messages-context.js";
import { UserPreferencesProvider } from "./preferences/user-preferences-context.js";

export interface AppServicesProviderProps {
  readonly services: AppRuntimeServices;
  readonly children: ReactNode;
}

export function AppServicesProvider({
  services,
  children,
}: AppServicesProviderProps): React.JSX.Element {
  return (
    <AppServicesContext.Provider value={services}>
      <UserPreferencesProvider settings={services.settings}>
        <AppMessagesProvider>{children}</AppMessagesProvider>
      </UserPreferencesProvider>
    </AppServicesContext.Provider>
  );
}

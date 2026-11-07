import { HashRouter, useRoutes } from "react-router-dom";

import { AppServicesProvider, createAppRoutes, type AppRuntimeServices } from "@dailyflow/features";

import { CloseConfirmation } from "../close-confirmation.js";

function AppRoutes(): React.JSX.Element | null {
  const routes = createAppRoutes({
    platform: "desktop",
    storageLabel: "SQLite",
    version: "0.1.0",
  });
  return useRoutes(routes);
}

export interface AppRouterProps {
  readonly services: AppRuntimeServices;
}

export function AppRouter({ services }: AppRouterProps): React.JSX.Element {
  return (
    <HashRouter>
      <AppServicesProvider services={services}>
        <AppRoutes />
        <CloseConfirmation />
      </AppServicesProvider>
    </HashRouter>
  );
}

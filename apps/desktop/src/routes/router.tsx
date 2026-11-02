import { HashRouter, useRoutes } from "react-router-dom";

import { createAppRoutes, type AppRuntimeServices } from "@dailyflow/features";

function AppRoutes({ services }: AppRouterProps): React.JSX.Element | null {
  const routes = createAppRoutes({
    platform: "desktop",
    storageLabel: "SQLite",
    version: "0.1.0",
    services,
  });
  return useRoutes(routes);
}

export interface AppRouterProps {
  readonly services: AppRuntimeServices;
}

export function AppRouter({ services }: AppRouterProps): React.JSX.Element {
  return (
    <HashRouter>
      <AppRoutes services={services} />
    </HashRouter>
  );
}

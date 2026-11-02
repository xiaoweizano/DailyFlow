import { BrowserRouter, useRoutes } from "react-router-dom";

import { createAppRoutes, type AppRuntimeServices } from "@dailyflow/features";

function AppRoutes({ services }: AppRouterProps): React.JSX.Element | null {
  const routes = createAppRoutes({
    platform: "web",
    storageLabel: "IndexedDB",
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
    <BrowserRouter>
      <AppRoutes services={services} />
    </BrowserRouter>
  );
}

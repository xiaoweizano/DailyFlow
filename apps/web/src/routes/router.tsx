import { BrowserRouter, useRoutes } from "react-router-dom";

import { createAppRoutes } from "@dailyflow/features";

const routes = createAppRoutes({
  platform: "web",
  storageLabel: "IndexedDB",
  version: "0.1.0",
});

function AppRoutes(): React.JSX.Element | null {
  return useRoutes(routes);
}

export function AppRouter(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

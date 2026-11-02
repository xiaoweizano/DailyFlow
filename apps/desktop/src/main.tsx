import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@dailyflow/ui/styles/globals.css";

import { App } from "./app.js";
import { desktopServices } from "./composition.js";
import { installDesktopCloseGuard } from "./install-desktop-close-guard.js";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void installDesktopCloseGuard(desktopServices.lifecycle).catch((error: unknown) => {
  console.error("Desktop close guard could not be installed", error);
});

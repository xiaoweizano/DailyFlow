import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@dailyflow/ui/styles/globals.css";

import { App } from "./app.js";
import { webServices } from "./composition.js";
import { installE2EBridge } from "./e2e-bridge.js";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

installE2EBridge(webServices);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

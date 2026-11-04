import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

function productionCsp(): Plugin {
  return {
    name: "dailyflow-production-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("connect-src 'self' ws: wss:;", "connect-src 'self';");
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), productionCsp()],
  css: {
    postcss: workspaceRoot,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

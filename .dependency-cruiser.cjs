/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-stays-pure",
      severity: "error",
      from: { path: "^packages/shared/src/" },
      to: {
        path: "^packages/(?!shared/)|node_modules/",
      },
    },
    {
      name: "domain-has-no-platform-or-higher-layer",
      severity: "error",
      from: { path: "^packages/domain/src/" },
      to: {
        path: "^packages/(?!shared/)|node_modules/(react|react-dom|@tauri-apps|dexie|better-sqlite3|sqlite3)",
      },
    },
    {
      name: "application-has-no-ui-or-storage-implementation",
      severity: "error",
      from: { path: "^packages/application/src/" },
      to: {
        path: "^packages/(infrastructure|features|ui)/|node_modules/(react|react-dom|@tauri-apps|dexie|better-sqlite3|sqlite3)",
      },
    },
    {
      name: "features-use-ports-not-platform-adapters",
      severity: "error",
      from: { path: "^packages/features/src/" },
      to: {
        path: "^packages/infrastructure/|node_modules/(@tauri-apps|dexie|better-sqlite3|sqlite3)",
      },
    },
    {
      name: "ui-does-not-own-use-cases-or-storage",
      severity: "error",
      from: { path: "^packages/ui/src/" },
      to: {
        path: "^packages/(application|infrastructure)/|node_modules/(@tauri-apps|dexie|better-sqlite3|sqlite3)",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(node_modules|dist|coverage|\\.turbo|src-tauri/target)/",
    },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      exportsFields: ["exports"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

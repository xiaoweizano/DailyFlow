import type { AppRuntimeServices } from "@dailyflow/features";

export interface DailyFlowE2EBridge {
  readonly journal: Pick<
    AppRuntimeServices["journal"],
    "get" | "save" | "listVersions" | "restore"
  >;
  readonly tasks: Pick<AppRuntimeServices["tasks"], "list" | "create">;
  readonly knowledge: Pick<AppRuntimeServices["knowledge"], "list" | "get" | "create" | "promote">;
  readonly search: Pick<AppRuntimeServices["search"], "query" | "rebuild">;
}

declare global {
  interface Window {
    __DAILYFLOW_E2E__?: DailyFlowE2EBridge;
  }
}

export function installE2EBridge(services: AppRuntimeServices): void {
  if (import.meta.env.VITE_E2E !== "true") {
    return;
  }

  const bridge: DailyFlowE2EBridge = {
    journal: {
      get: (input) => services.journal.get(input),
      save: (input) => services.journal.save(input),
      listVersions: (journalId, page) => services.journal.listVersions(journalId, page),
      restore: (input) => services.journal.restore(input),
    },
    tasks: {
      list: (input) => services.tasks.list(input),
      create: (input) => services.tasks.create(input),
    },
    knowledge: {
      list: (input) => services.knowledge.list(input),
      get: (id) => services.knowledge.get(id),
      create: (input) => services.knowledge.create(input),
      promote: (input) => services.knowledge.promote(input),
    },
    search: {
      query: (input) => services.search.query(input),
      rebuild: (options) => services.search.rebuild(options),
    },
  };

  window.__DAILYFLOW_E2E__ = Object.freeze(bridge);
}

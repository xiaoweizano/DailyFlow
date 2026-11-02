export type SaveFlushHandler = () => Promise<boolean>;

export interface SaveLifecycle {
  register: (handler: SaveFlushHandler) => () => void;
  flushAll: () => Promise<boolean>;
}

export function createSaveLifecycle(): SaveLifecycle {
  const handlers = new Set<SaveFlushHandler>();

  return {
    register: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    flushAll: async () => {
      const results = await Promise.allSettled([...handlers].map(async (handler) => handler()));
      return results.every((result) => result.status === "fulfilled" && result.value);
    },
  };
}

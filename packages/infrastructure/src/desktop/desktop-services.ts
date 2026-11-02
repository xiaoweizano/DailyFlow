import type { AppServices } from "@dailyflow/application";
import type { Clock } from "@dailyflow/domain";

import { DesktopAttachmentStore } from "./desktop-attachment-store.js";
import { DesktopJournalRepository } from "./desktop-journal-repository.js";
import { DesktopSearchPort } from "./desktop-search-port.js";
import { invokeTauriBridge, TauriCommandClient, type TauriInvoke } from "./tauri-client.js";

export type DesktopServices = Pick<AppServices, "journals" | "attachments" | "search">;

export interface CreateDesktopServicesOptions {
  readonly client?: TauriCommandClient;
  readonly invoke?: TauriInvoke;
  readonly clock?: Clock;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

export function createDesktopServices(options: CreateDesktopServicesOptions = {}): DesktopServices {
  const client = options.client ?? new TauriCommandClient(options.invoke ?? invokeTauriBridge);
  const clock = options.clock ?? systemClock;

  return {
    attachments: new DesktopAttachmentStore({ client, clock }),
    journals: new DesktopJournalRepository({ client, clock }),
    search: new DesktopSearchPort({ client }),
  };
}

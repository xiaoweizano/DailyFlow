import type { AppServices, TimelineQuery } from "@dailyflow/application";
import type { Clock } from "@dailyflow/domain";

import { DesktopAttachmentStore } from "./desktop-attachment-store.js";
import { DesktopJournalRepository } from "./desktop-journal-repository.js";
import { DesktopKnowledgeRepository } from "./desktop-knowledge-repository.js";
import { DesktopSearchPort } from "./desktop-search-port.js";
import { DesktopTaskRepository } from "./desktop-task-repository.js";
import { DesktopTimelineQuery } from "./desktop-timeline-query.js";
import { invokeTauriBridge, TauriCommandClient, type TauriInvoke } from "./tauri-client.js";

export type DesktopServices = Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search"
> & {
  readonly timeline: TimelineQuery;
};

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
    knowledge: new DesktopKnowledgeRepository({ client, clock }),
    tasks: new DesktopTaskRepository({ client, clock }),
    search: new DesktopSearchPort({ client }),
    timeline: new DesktopTimelineQuery({ client }),
  };
}

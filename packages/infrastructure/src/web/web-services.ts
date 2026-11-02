import type { AppServices } from "@dailyflow/application";
import type { Clock, IdGenerator } from "@dailyflow/domain";
import { createUuidV7 } from "@dailyflow/shared";

import { DailyFlowDb } from "./db.js";
import { DexieJournalRepository } from "./dexie-journal-repository.js";
import { DexieKnowledgeRepository } from "./dexie-knowledge-repository.js";
import { DexieSearchPort } from "./dexie-search-port.js";
import { DexieTaskRepository } from "./dexie-task-repository.js";
import { DexieTimelineQuery } from "./dexie-timeline-query.js";
import { WebAttachmentStore } from "./web-attachment-store.js";

export type WebServices = Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search"
> & {
  readonly timeline: DexieTimelineQuery;
};

export interface CreateWebServicesOptions {
  readonly database?: DailyFlowDb;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

const systemIds: IdGenerator = {
  nextId: createUuidV7,
};

export function createWebServices(options: CreateWebServicesOptions = {}): WebServices {
  const database = options.database ?? new DailyFlowDb();
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? systemIds;
  const search = new DexieSearchPort({ database, clock });

  return {
    attachments: new WebAttachmentStore({
      database,
      clock,
      ids,
    }),
    journals: new DexieJournalRepository({
      database,
      ids,
      clock,
      search,
    }),
    knowledge: new DexieKnowledgeRepository({ database, clock }),
    search,
    tasks: new DexieTaskRepository({ database, clock }),
    timeline: new DexieTimelineQuery({ database }),
  };
}

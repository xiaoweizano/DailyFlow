import type {
  AppServices,
  ExportSource,
  ExportTarget,
  ImportRepository,
  ImportSource,
  ImportTxtAnalyzer,
  TxtDocumentConverter as TxtDocumentConverterPort,
} from "@dailyflow/application";
import type { Clock, IdGenerator } from "@dailyflow/domain";
import { createUuidV7 } from "@dailyflow/shared";

import { DailyFlowDb } from "./db.js";
import { DexieImportRepository } from "./dexie-import-repository.js";
import { DexieAnalyticsQuery } from "./dexie-analytics-query.js";
import { DexieJournalRepository } from "./dexie-journal-repository.js";
import { DexieKnowledgeRepository } from "./dexie-knowledge-repository.js";
import { DexieSearchPort } from "./dexie-search-port.js";
import { DexieTaskRepository } from "./dexie-task-repository.js";
import { DexieTimelineQuery } from "./dexie-timeline-query.js";
import { DexieReportRepository } from "./dexie-report-repository.js";
import { WebAttachmentStore } from "./web-attachment-store.js";
import { WebExportSource } from "./web-export-source.js";
import { WebExportTarget } from "./web-export-target.js";
import { WebImportSource } from "./web-import-source.js";
import { TxtAnalyzer } from "../shared/import/txt-analyzer.js";
import { TxtDocumentConverter } from "../shared/import/txt-document-converter.js";

export type WebServices = Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search" | "analytics" | "reports"
> & {
  readonly importStorage: {
    readonly analyzer: ImportTxtAnalyzer;
    readonly converter: TxtDocumentConverterPort;
    readonly repository: ImportRepository;
    readonly source: ImportSource;
  };
  readonly exportStorage: {
    readonly source: ExportSource;
    readonly target: ExportTarget;
  };
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
    analytics: new DexieAnalyticsQuery({ database }),
    attachments: new WebAttachmentStore({
      database,
      clock,
      ids,
    }),
    importStorage: {
      analyzer: new TxtAnalyzer(),
      converter: new TxtDocumentConverter(),
      repository: new DexieImportRepository({ database, ids }),
      source: new WebImportSource(),
    },
    exportStorage: {
      source: new WebExportSource({ database }),
      target: new WebExportTarget(),
    },
    journals: new DexieJournalRepository({
      database,
      ids,
      clock,
      search,
    }),
    knowledge: new DexieKnowledgeRepository({ database, clock }),
    reports: new DexieReportRepository({ database, clock }),
    search,
    tasks: new DexieTaskRepository({ database, clock }),
    timeline: new DexieTimelineQuery({ database }),
  };
}

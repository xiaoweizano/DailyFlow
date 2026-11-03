import type {
  AppServices,
  BackupService,
  BackupSource,
  BackupTarget,
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
import { DexieDataManagementPort } from "./dexie-data-management-port.js";
import { DexieJournalRepository } from "./dexie-journal-repository.js";
import { DexieKnowledgeRepository } from "./dexie-knowledge-repository.js";
import { DexieSearchPort } from "./dexie-search-port.js";
import { DexieTaskRepository } from "./dexie-task-repository.js";
import { DexieTimelineQuery } from "./dexie-timeline-query.js";
import { DexieReportRepository } from "./dexie-report-repository.js";
import { WebAttachmentStore } from "./web-attachment-store.js";
import { WebBackupService } from "./web-backup-service.js";
import { WebBackupSource } from "./web-backup-source.js";
import { WebBackupTarget } from "./web-backup-target.js";
import { WebExportSource } from "./web-export-source.js";
import { WebExportTarget } from "./web-export-target.js";
import { WebImportSource } from "./web-import-source.js";
import { WebSecretStore } from "./web-secret-store.js";
import { WebSettingsStore } from "./web-settings-store.js";
import { TxtAnalyzer } from "../shared/import/txt-analyzer.js";
import { TxtDocumentConverter } from "../shared/import/txt-document-converter.js";

export type WebServices = Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search" | "analytics" | "reports"
> & {
  readonly dataManagement: DexieDataManagementPort;
  readonly backupStorage: {
    readonly service: BackupService;
    readonly source: BackupSource;
    readonly target: BackupTarget;
  };
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
  readonly settingsStore: WebSettingsStore;
  readonly secretStore: WebSecretStore;
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
  const backupService = new WebBackupService({
    database,
    clock,
    ids,
    appVersion: "0.1.0",
  });

  return {
    analytics: new DexieAnalyticsQuery({ database }),
    attachments: new WebAttachmentStore({
      database,
      clock,
      ids,
    }),
    dataManagement: new DexieDataManagementPort({ database }),
    backupStorage: {
      service: backupService,
      source: new WebBackupSource(),
      target: new WebBackupTarget(),
    },
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
    settingsStore: new WebSettingsStore({ database, clock }),
    secretStore: new WebSecretStore(),
  };
}

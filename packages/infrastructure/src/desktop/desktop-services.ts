import type {
  AppServices,
  ImportRepository,
  ImportSource,
  ImportTxtAnalyzer,
  TimelineQuery,
  TxtDocumentConverter as TxtDocumentConverterPort,
} from "@dailyflow/application";
import type { Clock } from "@dailyflow/domain";

import { TxtAnalyzer } from "../shared/import/txt-analyzer.js";
import { TxtDocumentConverter } from "../shared/import/txt-document-converter.js";
import { DesktopAttachmentStore } from "./desktop-attachment-store.js";
import { DesktopAnalyticsQuery } from "./desktop-analytics-query.js";
import { DesktopImportRepository } from "./desktop-import-repository.js";
import {
  DesktopImportSource,
  type DesktopDirectoryPicker,
} from "./desktop-import-source.js";
import { DesktopJournalRepository } from "./desktop-journal-repository.js";
import { DesktopKnowledgeRepository } from "./desktop-knowledge-repository.js";
import { DesktopSearchPort } from "./desktop-search-port.js";
import { DesktopReportRepository } from "./desktop-report-repository.js";
import { DesktopTaskRepository } from "./desktop-task-repository.js";
import { DesktopTimelineQuery } from "./desktop-timeline-query.js";
import { invokeTauriBridge, TauriCommandClient, type TauriInvoke } from "./tauri-client.js";

export type DesktopServices = Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search" | "analytics" | "reports"
> & {
  readonly importStorage: {
    readonly analyzer: ImportTxtAnalyzer;
    readonly converter: TxtDocumentConverterPort;
    readonly repository: ImportRepository;
    readonly source: ImportSource;
  };
  readonly timeline: TimelineQuery;
};

export interface CreateDesktopServicesOptions {
  readonly client?: TauriCommandClient;
  readonly invoke?: TauriInvoke;
  readonly clock?: Clock;
  readonly importPicker?: DesktopDirectoryPicker;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

export function createDesktopServices(options: CreateDesktopServicesOptions = {}): DesktopServices {
  const client = options.client ?? new TauriCommandClient(options.invoke ?? invokeTauriBridge);
  const clock = options.clock ?? systemClock;
  const importSource = new DesktopImportSource({
    client,
    picker: options.importPicker ?? selectDesktopDirectory,
  });

  return {
    analytics: new DesktopAnalyticsQuery({ client }),
    attachments: new DesktopAttachmentStore({ client, clock }),
    importStorage: {
      analyzer: new TxtAnalyzer(),
      converter: new TxtDocumentConverter(),
      repository: new DesktopImportRepository({ client }),
      source: importSource,
    },
    journals: new DesktopJournalRepository({ client, clock }),
    knowledge: new DesktopKnowledgeRepository({ client, clock }),
    reports: new DesktopReportRepository({ client, clock }),
    tasks: new DesktopTaskRepository({ client, clock }),
    search: new DesktopSearchPort({ client }),
    timeline: new DesktopTimelineQuery({ client }),
  };
}

async function selectDesktopDirectory(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 TXT 日志目录",
  });
  return typeof selected === "string" ? selected : null;
}

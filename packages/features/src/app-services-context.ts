import type { ImportService, SearchPort, TimelineQuery } from "@dailyflow/application";
import { createContext } from "react";

import type { AnalyticsRuntimeServices } from "./analytics/analytics-services.js";
import type { AttachmentRuntimeServices } from "./attachments/attachment-services.js";
import type { JournalRuntimeServices } from "./journal/journal-services.js";
import type { KnowledgeRuntimeServices } from "./knowledge/knowledge-services.js";
import type { SaveLifecycle } from "./lifecycle/save-lifecycle.js";
import type { TaskRuntimeServices } from "./tasks/task-services.js";
import type { BackupRuntimeServices } from "./data-management/backup-services.js";
import type { ExportRuntimeServices } from "./data-management/export-services.js";

export interface AppRuntimeServices {
  readonly analytics: AnalyticsRuntimeServices;
  readonly backups: BackupRuntimeServices;
  readonly exports: ExportRuntimeServices;
  readonly imports: ImportService;
  readonly journal: JournalRuntimeServices;
  readonly knowledge: KnowledgeRuntimeServices;
  readonly attachments: AttachmentRuntimeServices;
  readonly search: SearchPort;
  readonly lifecycle: SaveLifecycle;
  readonly tasks: TaskRuntimeServices;
  readonly timeline: TimelineQuery;
}

export const AppServicesContext = createContext<AppRuntimeServices | null>(null);

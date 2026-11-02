import type { SearchPort, TimelineQuery } from "@dailyflow/application";
import { createContext } from "react";

import type { AttachmentRuntimeServices } from "./attachments/attachment-services.js";
import type { JournalRuntimeServices } from "./journal/journal-services.js";
import type { SaveLifecycle } from "./lifecycle/save-lifecycle.js";
import type { TaskRuntimeServices } from "./tasks/task-services.js";

export interface AppRuntimeServices {
  readonly journal: JournalRuntimeServices;
  readonly attachments: AttachmentRuntimeServices;
  readonly search: SearchPort;
  readonly lifecycle: SaveLifecycle;
  readonly tasks: TaskRuntimeServices;
  readonly timeline: TimelineQuery;
}

export const AppServicesContext = createContext<AppRuntimeServices | null>(null);

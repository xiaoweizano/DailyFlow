import type { SearchPort } from "@dailyflow/application";
import { createContext } from "react";

import type { JournalRuntimeServices } from "./journal/journal-services.js";
import type { SaveLifecycle } from "./lifecycle/save-lifecycle.js";

export interface AppRuntimeServices {
  readonly journal: JournalRuntimeServices;
  readonly search: SearchPort;
  readonly lifecycle: SaveLifecycle;
}

export const AppServicesContext = createContext<AppRuntimeServices | null>(null);

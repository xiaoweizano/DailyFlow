import type { LocalePreference } from "@dailyflow/application";
import { createContext } from "react";

import type { AppMessages } from "./app-messages.js";

export interface AppMessagesRuntime {
  readonly locale: LocalePreference;
  readonly messages: AppMessages;
  readonly setLocalePreview: (locale: LocalePreference | null) => void;
}

export const AppMessagesContext = createContext<AppMessagesRuntime | null>(null);

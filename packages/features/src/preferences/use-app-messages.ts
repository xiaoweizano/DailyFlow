import { useContext } from "react";

import { AppMessagesContext, type AppMessagesRuntime } from "./app-messages-runtime.js";

export function useAppMessages(): AppMessagesRuntime {
  const value = useContext(AppMessagesContext);
  if (value === null) {
    throw new Error("useAppMessages must be used inside AppMessagesProvider");
  }

  return value;
}

export function useOptionalAppMessages(): AppMessagesRuntime | null {
  return useContext(AppMessagesContext);
}

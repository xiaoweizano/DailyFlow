import { type ReactNode, useEffect, useMemo } from "react";

import { getAppMessages } from "./app-messages.js";
import { AppMessagesContext, type AppMessagesRuntime } from "./app-messages-runtime.js";
import { useUserPreferences } from "./use-user-preferences.js";

export function AppMessagesProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  const { preferences } = useUserPreferences();
  const locale = preferences.locale;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<AppMessagesRuntime>(
    () => ({
      locale,
      messages: getAppMessages(locale),
    }),
    [locale],
  );

  return <AppMessagesContext.Provider value={value}>{children}</AppMessagesContext.Provider>;
}

import type { LocalePreference } from "@dailyflow/application";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { getAppMessages } from "./app-messages.js";
import { AppMessagesContext, type AppMessagesRuntime } from "./app-messages-runtime.js";
import { useUserPreferences } from "./use-user-preferences.js";

export function AppMessagesProvider({
  children,
}: {
  readonly children: ReactNode;
}): React.JSX.Element {
  const { preferences } = useUserPreferences();
  const [previewLocale, setPreviewLocale] = useState<LocalePreference | null>(null);
  const locale = previewLocale ?? preferences.locale;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocalePreview = useCallback((nextLocale: LocalePreference | null): void => {
    setPreviewLocale(nextLocale);
  }, []);

  const value = useMemo<AppMessagesRuntime>(
    () => ({
      locale,
      messages: getAppMessages(locale),
      setLocalePreview,
    }),
    [locale, setLocalePreview],
  );

  return <AppMessagesContext.Provider value={value}>{children}</AppMessagesContext.Provider>;
}

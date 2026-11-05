import type { UserPreferences } from "@dailyflow/application";
import { Input } from "@dailyflow/ui";
import { Database, History, MapPin } from "lucide-react";

import type { SettingsMessages } from "../preferences/messages.js";
import type { ShortcutPlatform } from "../platform/command-registry.js";
import { SettingsSection } from "./settings-section.js";

export interface DataStorageSettingsProps {
  readonly preferences: UserPreferences;
  readonly messages: SettingsMessages;
  readonly platform: ShortcutPlatform;
  readonly storageLabel: string;
  readonly onUpdate: (patch: Partial<UserPreferences>) => void;
}

export function DataStorageSettings({
  preferences,
  messages,
  platform,
  storageLabel,
  onUpdate,
}: DataStorageSettingsProps): React.JSX.Element {
  const isDesktop = platform === "windows" || platform === "macos";

  return (
    <div className="grid gap-[var(--settings-row-gap)]">
      <SettingsSection
        id="data-storage"
        eyebrow="Storage"
        title={messages.data.title}
        description={messages.data.description}
        icon={Database}
      >
        <div className="divide-y divide-border border-y border-border">
          <div className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] sm:items-start">
            <div>
              <p className="text-sm font-medium text-foreground">{messages.data.storage}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {isDesktop ? messages.data.storageDescription : messages.data.browserStorage}
              </p>
            </div>
            <div className="min-w-0">
              <Input
                aria-label={messages.data.storage}
                readOnly
                value={preferences.customDataDirectory ?? messages.data.defaultLocation}
                className="font-mono text-xs"
              />
              <p className="mt-1.5 break-words text-[11px] leading-5 text-muted-foreground">
                {isDesktop
                  ? `桌面端使用 ${storageLabel} 保存结构化数据，附件由同一应用数据目录管理。`
                  : `Web 端使用 ${storageLabel}，浏览器负责持久化与空间配额。`}
              </p>
            </div>
          </div>

          <div className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] sm:items-center">
            <div className="flex items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">迁移与备份</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {isDesktop
                    ? "更改数据目录前会复制并校验现有数据；恢复入口位于“数据”模块。"
                    : "浏览器不提供自定义数据目录；请定期导出或创建备份。"}
                </p>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground sm:text-right">
              {isDesktop ? "当前保留默认位置" : "由浏览器管理"}
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="history-settings"
        eyebrow="History"
        title={messages.data.history}
        description={messages.data.historyDescription}
        icon={History}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {messages.data.maxVersions}
            <Input
              type="number"
              min={10}
              max={1000}
              value={preferences.historyRetention.maxVersions}
              onChange={(event) =>
                onUpdate({
                  historyRetention: {
                    ...preferences.historyRetention,
                    maxVersions: Number(event.currentTarget.value),
                  },
                })
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {messages.data.maxAgeDays}
            <Input
              type="number"
              min={7}
              max={3650}
              value={preferences.historyRetention.maxAgeDays}
              onChange={(event) =>
                onUpdate({
                  historyRetention: {
                    ...preferences.historyRetention,
                    maxAgeDays: Number(event.currentTarget.value),
                  },
                })
              }
            />
          </label>
        </div>
      </SettingsSection>
    </div>
  );
}

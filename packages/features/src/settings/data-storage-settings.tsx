import type { UserPreferences } from "@dailyflow/application";
import { Button, Input } from "@dailyflow/ui";
import { Database, FolderCog, History, LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  StorageLocationInfo,
  StorageLocationRuntimeServices,
} from "../app-services-context.js";
import type { SettingsMessages } from "../preferences/messages.js";
import type { ShortcutPlatform } from "../platform/command-registry.js";
import { SettingsSection } from "./settings-section.js";

export interface DataStorageSettingsProps {
  readonly preferences: UserPreferences;
  readonly messages: SettingsMessages;
  readonly platform: ShortcutPlatform;
  readonly storageLabel: string;
  readonly storageLocation?: StorageLocationRuntimeServices;
  readonly onUpdate: (patch: Partial<UserPreferences>) => void;
}

export function DataStorageSettings({
  preferences,
  messages,
  platform,
  storageLabel,
  storageLocation,
  onUpdate,
}: DataStorageSettingsProps): React.JSX.Element {
  const isDesktop = platform === "windows" || platform === "macos";
  const [storageInfo, setStorageInfo] = useState<StorageLocationInfo | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop || storageLocation === undefined) {
      return;
    }

    let active = true;
    void storageLocation
      .get()
      .then((info) => {
        if (active) {
          setStorageInfo(info);
          setStorageError(null);
        }
      })
      .catch(() => {
        if (active) {
          setStorageError("无法读取当前数据目录，请稍后重试。");
        }
      });

    return () => {
      active = false;
    };
  }, [isDesktop, storageLocation]);

  async function handleMigrate(): Promise<void> {
    if (storageLocation === undefined) {
      return;
    }

    setMigrating(true);
    setMigrationMessage(null);
    setStorageError(null);
    try {
      const result = await storageLocation.migrate(preferences);
      if (result === null) {
        return;
      }

      onUpdate(result.preferences);
      setStorageInfo({
        currentDirectory: result.currentDirectory,
        defaultDirectory: result.defaultDirectory,
        isCustom: result.isCustom,
      });
      setMigrationMessage(
        result.restartRequired
          ? `数据已迁移并校验完成。请重启 DailyFlow 后使用新位置。原数据备份保存在 ${result.backupDirectory}`
          : "数据已迁移并校验完成。",
      );
    } catch {
      setStorageError("更改存储位置失败，原数据没有被删除，请检查目标目录后重试。");
    } finally {
      setMigrating(false);
    }
  }

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
                value={
                  storageInfo?.currentDirectory ??
                  preferences.customDataDirectory ??
                  messages.data.defaultLocation
                }
                className="font-mono text-xs"
              />
              <p className="mt-1.5 break-words text-[11px] leading-5 text-muted-foreground">
                {isDesktop
                  ? `桌面端使用 ${storageLabel} 保存结构化数据，附件由同一应用数据目录管理。`
                  : `Web 端使用 ${storageLabel}，浏览器负责持久化与空间配额。`}
              </p>
              {storageError === null ? null : (
                <p role="alert" className="mt-1.5 text-xs leading-5 text-danger">
                  {storageError}
                </p>
              )}
              {migrationMessage === null ? null : (
                <p role="status" className="mt-1.5 break-words text-xs leading-5 text-success">
                  {migrationMessage}
                </p>
              )}
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
            <div className="grid gap-2 sm:justify-items-end">
              <p className="text-xs leading-5 text-muted-foreground sm:text-right">
                {isDesktop
                  ? storageInfo?.isCustom
                    ? "当前使用自定义位置"
                    : "当前使用默认位置"
                  : "由浏览器管理"}
              </p>
              {isDesktop && storageLocation !== undefined ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={migrating}
                  onClick={() => void handleMigrate()}
                >
                  {migrating ? (
                    <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <FolderCog aria-hidden="true" className="size-3.5" />
                  )}
                  {migrating ? "正在迁移" : "更改存储位置"}
                </Button>
              ) : null}
            </div>
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

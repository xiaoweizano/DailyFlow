import type { UserPreferences } from "@dailyflow/application";
import { z } from "zod";

import { mapTauriError } from "./tauri-contracts.js";
import { invokeTauriBridge, type TauriInvoke } from "./tauri-client.js";

const StorageLocationInfoSchema = z.object({
  currentDirectory: z.string().min(1),
  defaultDirectory: z.string().min(1),
  isCustom: z.boolean(),
});

const StorageMigrationResponseSchema = z.object({
  destination: z.string().min(1),
  backupDirectory: z.string().min(1),
  restartRequired: z.boolean(),
});

export interface DesktopStorageLocationInfo {
  readonly currentDirectory: string;
  readonly defaultDirectory: string;
  readonly isCustom: boolean;
}

export interface DesktopStorageLocationMigrationResult extends DesktopStorageLocationInfo {
  readonly destination: string;
  readonly backupDirectory: string;
  readonly restartRequired: boolean;
  readonly preferences: UserPreferences;
}

export type DesktopStorageLocationPicker = () => Promise<string | null>;

export interface DesktopStorageLocationServiceOptions {
  readonly invoke?: TauriInvoke;
  readonly picker?: DesktopStorageLocationPicker;
}

async function selectDesktopStorageDirectory(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 DailyFlow 数据目录",
  });
  return typeof selected === "string" ? selected : null;
}

export class DesktopStorageLocationService {
  private readonly invoke: TauriInvoke;
  private readonly picker: DesktopStorageLocationPicker;
  private lastInfo: DesktopStorageLocationInfo | null = null;

  constructor(options: DesktopStorageLocationServiceOptions = {}) {
    this.invoke = options.invoke ?? invokeTauriBridge;
    this.picker = options.picker ?? selectDesktopStorageDirectory;
  }

  async get(): Promise<DesktopStorageLocationInfo> {
    try {
      const response = await this.invoke("storage_location_get");
      const info = StorageLocationInfoSchema.parse(response);
      this.lastInfo = info;
      return info;
    } catch (error) {
      throw mapTauriError(error);
    }
  }

  async migrate(
    preferences: UserPreferences,
  ): Promise<DesktopStorageLocationMigrationResult | null> {
    const destination = await this.picker();
    if (destination === null) {
      return null;
    }

    const migratedPreferences: UserPreferences = {
      ...preferences,
      customDataDirectory: destination,
    };

    try {
      const response = await this.invoke("storage_location_migrate", {
        destination,
        preferencesJson: JSON.stringify(migratedPreferences),
      });
      const result = StorageMigrationResponseSchema.parse(response);
      const defaultDirectory = this.lastInfo?.defaultDirectory ?? destination;
      return {
        ...result,
        currentDirectory: result.destination,
        defaultDirectory,
        isCustom: true,
        preferences: migratedPreferences,
      };
    } catch (error) {
      throw mapTauriError(error);
    }
  }
}

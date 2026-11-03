import type { BackupSource, BackupSourceFile } from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";

export type DesktopBackupPicker = () => Promise<string | null>;

export interface DesktopBackupSourceOptions {
  readonly client: Pick<TauriCommandClient, "backupReadFile">;
  readonly picker?: DesktopBackupPicker;
}

async function selectDesktopBackupFile(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "选择 DailyFlow 备份文件",
    filters: [
      {
        name: "DailyFlow backup",
        extensions: ["zip", "dailyflow-backup"],
      },
    ],
  });
  return typeof selected === "string" ? selected : null;
}

function fileNameFromPath(sourcePath: string): string {
  return sourcePath.split(/[\\/]/u).at(-1) || "dailyflow-backup.zip";
}

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export class DesktopBackupSource implements BackupSource {
  private readonly client: Pick<TauriCommandClient, "backupReadFile">;
  private readonly picker: DesktopBackupPicker;

  constructor(options: DesktopBackupSourceOptions) {
    this.client = options.client;
    this.picker = options.picker ?? selectDesktopBackupFile;
  }

  async select(): Promise<BackupSourceFile | null> {
    const sourcePath = await this.picker();
    if (sourcePath === null) {
      return null;
    }

    const result = await this.client.backupReadFile(sourcePath);
    return {
      filename: fileNameFromPath(sourcePath),
      bytes: base64ToBytes(result.bytesBase64),
    };
  }
}

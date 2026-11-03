import type { BackupArtifact, BackupSaveResult, BackupTarget } from "@dailyflow/application";
import { parseContentHash } from "@dailyflow/domain";

import type { TauriCommandClient } from "./tauri-client.js";

export interface DesktopBackupPickerOptions {
  readonly suggestedName: string;
}

export type DesktopBackupTargetPicker = (
  options: DesktopBackupPickerOptions,
) => Promise<string | null>;

export interface DesktopBackupTargetOptions {
  readonly client: Pick<TauriCommandClient, "backupWriteFile">;
  readonly picker?: DesktopBackupTargetPicker;
}

async function selectDesktopBackupTarget(
  options: DesktopBackupPickerOptions,
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: options.suggestedName,
    filters: [
      {
        name: "DailyFlow backup",
        extensions: ["zip"],
      },
    ],
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))),
    );
  }
  return btoa(chunks.join(""));
}

function fileNameFromPath(targetPath: string): string {
  return targetPath.split(/[\\/]/u).at(-1) || "dailyflow-backup.zip";
}

export class DesktopBackupTarget implements BackupTarget {
  private readonly client: Pick<TauriCommandClient, "backupWriteFile">;
  private readonly picker: DesktopBackupTargetPicker;

  constructor(options: DesktopBackupTargetOptions) {
    this.client = options.client;
    this.picker = options.picker ?? selectDesktopBackupTarget;
  }

  async save(artifact: BackupArtifact): Promise<BackupSaveResult | null> {
    const targetPath = await this.picker({
      suggestedName: artifact.filename,
    });
    if (targetPath === null) {
      return null;
    }

    const result = await this.client.backupWriteFile({
      targetPath,
      bytesBase64: bytesToBase64(artifact.bytes),
      expectedSha256: parseContentHash(artifact.sha256),
    });
    return {
      filename: fileNameFromPath(targetPath),
      bytesWritten: result.bytesWritten,
    };
  }
}

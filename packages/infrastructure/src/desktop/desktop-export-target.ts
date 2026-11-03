import type {
  ExportArtifact,
  ExportSaveResult,
  ExportTarget,
} from "@dailyflow/application";
import { parseContentHash } from "@dailyflow/domain";

import type { TauriCommandClient } from "./tauri-client.js";

export interface DesktopExportPickerOptions {
  readonly suggestedName: string;
  readonly extensions: readonly string[];
}

export type DesktopExportPicker = (
  options: DesktopExportPickerOptions,
) => Promise<string | null>;

export interface DesktopExportTargetOptions {
  readonly client: Pick<TauriCommandClient, "writeExportFile">;
  readonly picker?: DesktopExportPicker;
}

async function selectDesktopExportPath(
  options: DesktopExportPickerOptions,
): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: options.suggestedName,
    filters: [
      {
        name: "DailyFlow ZIP export",
        extensions: [...options.extensions],
      },
    ],
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(
        ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
      ),
    );
  }
  return btoa(chunks.join(""));
}

function fileNameFromPath(targetPath: string): string {
  const segments = targetPath.split(/[\\/]/u);
  return segments.at(-1) || "dailyflow-export.zip";
}

export class DesktopExportTarget implements ExportTarget {
  private readonly client: Pick<TauriCommandClient, "writeExportFile">;
  private readonly picker: DesktopExportPicker;

  constructor(options: DesktopExportTargetOptions) {
    this.client = options.client;
    this.picker = options.picker ?? selectDesktopExportPath;
  }

  async save(artifact: ExportArtifact): Promise<ExportSaveResult | null> {
    const targetPath = await this.picker({
      suggestedName: artifact.filename,
      extensions: ["zip"],
    });
    if (targetPath === null) {
      return null;
    }

    const result = await this.client.writeExportFile({
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

import type { BackupArtifact, BackupSaveResult, BackupTarget } from "@dailyflow/application";

export type WebBackupFileSaver = (blob: Blob, filename: string) => Promise<boolean>;

export interface WebBackupTargetOptions {
  readonly saveFile?: WebBackupFileSaver;
}

function downloadInBrowser(blob: Blob, filename: string): boolean {
  if (globalThis.document === undefined || globalThis.URL.createObjectURL === undefined) {
    throw new Error("No browser download API is available.");
  }

  const objectUrl = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  globalThis.document.body.append(anchor);
  try {
    anchor.click();
    return true;
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => {
      globalThis.URL.revokeObjectURL(objectUrl);
    }, 0);
  }
}

export class WebBackupTarget implements BackupTarget {
  private readonly saveFile: WebBackupFileSaver;

  constructor(options: WebBackupTargetOptions = {}) {
    this.saveFile =
      options.saveFile ?? (async (blob, filename) => downloadInBrowser(blob, filename));
  }

  async save(artifact: BackupArtifact): Promise<BackupSaveResult | null> {
    const blob = new Blob([artifact.bytes.slice().buffer], {
      type: artifact.mediaType,
    });
    const saved = await this.saveFile(blob, artifact.filename);
    if (!saved) {
      return null;
    }

    return {
      filename: artifact.filename,
      bytesWritten: artifact.bytes.byteLength,
    };
  }
}

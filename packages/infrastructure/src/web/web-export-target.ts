import type {
  ExportArtifact,
  ExportSaveResult,
  ExportTarget,
} from "@dailyflow/application";

export interface WebFileWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface WebFileHandle {
  readonly name: string;
  createWritable(): Promise<WebFileWritable>;
}

export interface WebSaveFilePickerOptions {
  readonly suggestedName?: string;
  readonly types?: readonly {
    readonly description: string;
    readonly accept: Readonly<Record<string, readonly string[]>>;
  }[];
}

export type WebSaveFilePicker = (
  options?: WebSaveFilePickerOptions,
) => Promise<WebFileHandle | null>;

export type WebArtifactDownload = (
  artifact: ExportArtifact,
) => void | Promise<void>;

export interface WebExportTargetOptions {
  readonly saveFilePicker?: WebSaveFilePicker;
  readonly download?: WebArtifactDownload;
}

interface WindowWithFilePicker {
  readonly showSaveFilePicker?: WebSaveFilePicker;
}

async function downloadInBrowser(artifact: ExportArtifact): Promise<void> {
  if (globalThis.document === undefined || globalThis.URL.createObjectURL === undefined) {
    throw new Error("No browser download API is available.");
  }
  const blob = new Blob([artifact.bytes.slice().buffer], {
    type: artifact.mediaType,
  });
  const objectUrl = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = artifact.filename;
  anchor.hidden = true;
  globalThis.document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => {
      globalThis.URL.revokeObjectURL(objectUrl);
    }, 0);
  }
}

export class WebExportTarget implements ExportTarget {
  private readonly saveFilePicker: WebSaveFilePicker | undefined;
  private readonly download: WebArtifactDownload;

  constructor(options: WebExportTargetOptions = {}) {
    this.saveFilePicker =
      options.saveFilePicker ??
      (globalThis as typeof globalThis & WindowWithFilePicker).showSaveFilePicker;
    this.download = options.download ?? downloadInBrowser;
  }

  async save(artifact: ExportArtifact): Promise<ExportSaveResult | null> {
    if (this.saveFilePicker === undefined) {
      await this.download(artifact);
      return {
        filename: artifact.filename,
        bytesWritten: artifact.bytes.byteLength,
      };
    }
    let handle: WebFileHandle | null;
    try {
      handle = await this.saveFilePicker({
        suggestedName: artifact.filename,
        types: [
          {
            description: "DailyFlow ZIP export",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
    if (handle === null) {
      return null;
    }
    const writable = await handle.createWritable();
    await writable.write(artifact.bytes);
    await writable.close();
    return {
      filename: handle.name,
      bytesWritten: artifact.bytes.byteLength,
    };
  }
}

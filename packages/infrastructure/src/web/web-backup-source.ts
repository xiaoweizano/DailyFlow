import type { BackupSource, BackupSourceFile } from "@dailyflow/application";

export type WebBackupFilePicker = () => Promise<File | null>;

export interface WebBackupSourceOptions {
  readonly picker?: WebBackupFilePicker;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function pickBackupFile(): Promise<File | null> {
  if (typeof document === "undefined") {
    return null;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip,application/zip";
  input.style.display = "none";
  document.body.append(input);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      input.remove();
    };
    const onChange = () => {
      const file = input.files?.item(0) ?? null;
      cleanup();
      resolve(file);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    input.addEventListener("change", onChange, { once: true });
    input.addEventListener("cancel", onCancel, { once: true });
    try {
      input.showPicker();
    } catch (error) {
      cleanup();
      if (isAbortError(error)) {
        resolve(null);
        return;
      }
      reject(error);
    }
  });
}

export class WebBackupSource implements BackupSource {
  private readonly picker: WebBackupFilePicker;

  constructor(options: WebBackupSourceOptions = {}) {
    this.picker = options.picker ?? pickBackupFile;
  }

  async select(): Promise<BackupSourceFile | null> {
    const file = await this.picker();
    if (file === null) {
      return null;
    }

    return {
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
  }
}

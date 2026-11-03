import {
  normalizeImportRelativePath,
  PortError,
  type ImportRoot,
  type ImportScanOptions,
  type ImportSource,
  type RawImportFile,
} from "@dailyflow/application";
import type { ImportIssue } from "@dailyflow/shared";

export interface WebFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}

export interface WebDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterableIterator<WebDirectoryHandle | WebFileHandle>;
}

export type WebDirectoryPicker = () => Promise<WebDirectoryHandle | null>;
export type WebFallbackFilePicker = () => Promise<readonly File[] | null>;

export interface WebImportSourceOptions {
  readonly pickDirectory?: WebDirectoryPicker;
  readonly pickFallbackFiles?: WebFallbackFilePicker;
}

type WebRootHandle =
  | {
      readonly kind: "directory";
      readonly handle: WebDirectoryHandle;
    }
  | {
      readonly kind: "files";
      readonly files: readonly File[];
      readonly label: string;
    };

interface DirectoryPickerGlobal {
  showDirectoryPicker?: () => Promise<WebDirectoryHandle>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readIssue(error: unknown): ImportIssue {
  return {
    code: "FILE_READ_FAILED",
    message: error instanceof Error ? error.message : "Web TXT file could not be read",
    retryable: true,
  };
}

function isTxtFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".txt");
}

function compareNames(
  left: WebDirectoryHandle | WebFileHandle,
  right: WebDirectoryHandle | WebFileHandle,
): number {
  return left.name.localeCompare(right.name, "en");
}

async function pickDirectoryWithFileSystemAccess(): Promise<WebDirectoryHandle | null> {
  const picker = (globalThis as typeof globalThis & DirectoryPickerGlobal).showDirectoryPicker;
  if (typeof picker !== "function") {
    return null;
  }

  try {
    return await picker();
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }
}

async function pickDirectoryInputFiles(): Promise<readonly File[] | null> {
  if (typeof document === "undefined") {
    return null;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".txt,text/plain";
  input.setAttribute("webkitdirectory", "");
  input.style.display = "none";
  document.body.append(input);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      input.remove();
    };
    const onChange = () => {
      const files = input.files === null ? [] : Array.from(input.files);
      cleanup();
      resolve(files.length === 0 ? null : files);
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
      reject(error);
    }
  });
}

function parseRoot(root: ImportRoot): WebRootHandle {
  if (typeof root.handle === "object" && root.handle !== null) {
    if ("kind" in root.handle && root.handle.kind === "directory" && "handle" in root.handle) {
      return root.handle as WebRootHandle;
    }
    if ("kind" in root.handle && root.handle.kind === "files" && "files" in root.handle) {
      return root.handle as WebRootHandle;
    }
  }

  throw new PortError("VALIDATION_ERROR", {
    message: "Web import root is invalid",
    fields: { root: "The selected directory handle is missing" },
  });
}

function fallbackRelativePath(file: File): {
  readonly label: string;
  readonly relativePath: string;
} {
  const normalized = normalizeImportRelativePath(
    file.webkitRelativePath.length === 0 ? file.name : file.webkitRelativePath,
  );
  const segments = normalized.split("/");
  if (segments.length === 1) {
    return { label: "Selected files", relativePath: normalized };
  }

  return {
    label: segments[0]!,
    relativePath: segments.slice(1).join("/"),
  };
}

async function readFile(file: File, relativePath: string): Promise<RawImportFile> {
  const normalized = normalizeImportRelativePath(relativePath);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      relativePath: normalized,
      fileName: file.name,
      rawBytes: bytes,
      byteSize: bytes.byteLength,
      lastModified: file.lastModified,
      readError: null,
    };
  } catch (error) {
    return {
      relativePath: normalized,
      fileName: file.name,
      rawBytes: null,
      byteSize: file.size,
      lastModified: file.lastModified,
      readError: readIssue(error),
    };
  }
}

export class WebImportSource implements ImportSource {
  private readonly pickDirectory: WebDirectoryPicker;
  private readonly pickFallbackFiles: WebFallbackFilePicker;

  constructor(options: WebImportSourceOptions = {}) {
    this.pickDirectory = options.pickDirectory ?? pickDirectoryWithFileSystemAccess;
    this.pickFallbackFiles = options.pickFallbackFiles ?? pickDirectoryInputFiles;
  }

  async selectRoot(): Promise<ImportRoot | null> {
    const directory = await this.pickDirectory();
    if (directory !== null) {
      return {
        label: directory.name,
        handle: { kind: "directory", handle: directory } satisfies WebRootHandle,
      };
    }

    const files = await this.pickFallbackFiles();
    if (files === null || files.length === 0) {
      return null;
    }
    const first = fallbackRelativePath(files[0]!);
    return {
      label: first.label,
      handle: { kind: "files", files, label: first.label } satisfies WebRootHandle,
    };
  }

  async *scan(root: ImportRoot, options: ImportScanOptions = {}): AsyncIterable<RawImportFile> {
    options.signal?.throwIfAborted();
    const parsed = parseRoot(root);
    if (parsed.kind === "directory") {
      yield* this.scanDirectory(parsed.handle, [], options.signal);
      return;
    }

    const files = parsed.files
      .map((file) => ({ file, path: fallbackRelativePath(file) }))
      .filter(({ path }) => path.label === parsed.label && isTxtFile(path.relativePath))
      .sort((left, right) => left.path.relativePath.localeCompare(right.path.relativePath, "en"));

    for (const { file, path } of files) {
      options.signal?.throwIfAborted();
      yield await readFile(file, path.relativePath);
    }
  }

  private async *scanDirectory(
    directory: WebDirectoryHandle,
    parentSegments: readonly string[],
    signal: AbortSignal | undefined,
  ): AsyncIterable<RawImportFile> {
    const entries: (WebDirectoryHandle | WebFileHandle)[] = [];
    for await (const entry of directory.values()) {
      entries.push(entry);
    }
    entries.sort(compareNames);

    for (const entry of entries) {
      signal?.throwIfAborted();
      const segments = [...parentSegments, entry.name];
      if (entry.kind === "directory") {
        yield* this.scanDirectory(entry, segments, signal);
        continue;
      }
      if (!isTxtFile(entry.name)) {
        continue;
      }

      const relativePath = normalizeImportRelativePath(segments.join("/"));
      try {
        const file = await entry.getFile();
        yield await readFile(file, relativePath);
      } catch (error) {
        yield {
          relativePath,
          fileName: entry.name,
          rawBytes: null,
          byteSize: null,
          lastModified: null,
          readError: readIssue(error),
        };
      }
    }
  }
}

import {
  normalizeImportRelativePath,
  PortError,
  type ImportRoot,
  type ImportScanOptions,
  type ImportSource,
  type RawImportFile,
} from "@dailyflow/application";
import type { ImportIssue } from "@dailyflow/shared";

import type { ImportScanResultDto, ImportTxtFileDto } from "./tauri-contracts.js";

export interface DesktopImportClient {
  scanTxtImport(rootPath: string): Promise<ImportScanResultDto>;
  readTxtImport(rootPath: string, relativePath: string): Promise<ImportTxtFileDto>;
}

export type DesktopDirectoryPicker = () => Promise<string | null>;

export interface DesktopImportSourceOptions {
  readonly client: DesktopImportClient;
  readonly picker: DesktopDirectoryPicker;
}

interface DesktopRootHandle {
  readonly rootPath: string;
}

function rootLabelFromPath(rootPath: string): string {
  const normalized = rootPath.replaceAll("\\", "/").replace(/\/+$/u, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? rootPath;
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readIssue(error: unknown): ImportIssue {
  return {
    code: "FILE_READ_FAILED",
    message: error instanceof Error ? error.message : "Desktop TXT file could not be read",
    retryable: true,
  };
}

function parseRoot(root: ImportRoot): DesktopRootHandle {
  if (
    typeof root.handle !== "object" ||
    root.handle === null ||
    !("rootPath" in root.handle) ||
    typeof root.handle.rootPath !== "string" ||
    root.handle.rootPath.trim().length === 0
  ) {
    throw new PortError("VALIDATION_ERROR", {
      message: "Desktop import root is invalid",
      fields: { root: "The selected directory path is missing" },
    });
  }

  return { rootPath: root.handle.rootPath };
}

export class DesktopImportSource implements ImportSource {
  private readonly client: DesktopImportClient;
  private readonly picker: DesktopDirectoryPicker;

  constructor(options: DesktopImportSourceOptions) {
    this.client = options.client;
    this.picker = options.picker;
  }

  async selectRoot(): Promise<ImportRoot | null> {
    const rootPath = await this.picker();
    if (rootPath === null) {
      return null;
    }
    if (rootPath.trim().length === 0) {
      throw new PortError("VALIDATION_ERROR", {
        message: "Selected import directory is invalid",
        fields: { root: "Directory path cannot be empty" },
      });
    }

    return {
      label: rootLabelFromPath(rootPath),
      handle: { rootPath } satisfies DesktopRootHandle,
    };
  }

  async *scan(root: ImportRoot, options: ImportScanOptions = {}): AsyncIterable<RawImportFile> {
    options.signal?.throwIfAborted();
    const { rootPath } = parseRoot(root);
    const scan = await this.client.scanTxtImport(rootPath);

    for (const candidate of scan.candidates) {
      options.signal?.throwIfAborted();
      const relativePath = normalizeImportRelativePath(candidate.relativePath);
      if (relativePath !== candidate.relativePath.replaceAll("\\", "/")) {
        throw new PortError("VALIDATION_ERROR", {
          message: "Desktop import scanner returned a non-canonical path",
          fields: { relativePath: candidate.relativePath },
        });
      }

      try {
        const file = await this.client.readTxtImport(rootPath, relativePath);
        const responsePath = normalizeImportRelativePath(file.relativePath);
        if (responsePath !== relativePath) {
          throw new PortError("VALIDATION_ERROR", {
            message: "Desktop import read response does not match the requested path",
            fields: { relativePath: file.relativePath },
          });
        }
        const rawBytes = decodeBase64(file.bytesBase64);
        if (file.byteSize !== rawBytes.byteLength) {
          throw new PortError("VALIDATION_ERROR", {
            message: "Desktop import byte size does not match the returned file",
            fields: { byteSize: String(file.byteSize) },
          });
        }

        yield {
          relativePath,
          fileName: file.fileName,
          rawBytes,
          byteSize: rawBytes.byteLength,
          lastModified: file.lastModifiedMs,
          readError: null,
        };
      } catch (error) {
        if (error instanceof PortError && error.code === "VALIDATION_ERROR") {
          throw error;
        }
        yield {
          relativePath,
          fileName: candidate.fileName,
          rawBytes: null,
          byteSize: candidate.byteSize,
          lastModified: candidate.lastModifiedMs,
          readError: readIssue(error),
        };
      }
    }
  }
}

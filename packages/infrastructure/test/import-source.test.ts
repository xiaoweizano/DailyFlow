import { describe, expect, it, vi } from "vitest";

import {
  DesktopImportSource,
  type DesktopImportClient,
  type DesktopDirectoryPicker,
} from "../src/desktop/desktop-import-source.js";
import { WebImportSource } from "../src/web/web-import-source.js";

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

describe("DesktopImportSource", () => {
  it("uses the selected directory label and streams files through separate read calls", async () => {
    const picker = vi.fn<DesktopDirectoryPicker>().mockResolvedValue("C:\\logs\\202504");
    const client = {
      scanTxtImport: vi.fn().mockResolvedValue({
        rootLabel: "202504",
        candidates: [
          {
            relativePath: "202504/20250401.txt",
            fileName: "20250401.txt",
            byteSize: 6,
            lastModifiedMs: 1_700_000_000_000,
          },
          {
            relativePath: "202504/20250402.txt",
            fileName: "20250402.txt",
            byteSize: 3,
            lastModifiedMs: null,
          },
        ],
        ignoredEntryCount: 0,
      }),
      readTxtImport: vi
        .fn()
        .mockResolvedValueOnce({
          relativePath: "202504/20250401.txt",
          fileName: "20250401.txt",
          bytesBase64: toBase64(encoder.encode("日志")),
          byteSize: 6,
          lastModifiedMs: 1_700_000_000_000,
        })
        .mockResolvedValueOnce({
          relativePath: "202504/20250402.txt",
          fileName: "20250402.txt",
          bytesBase64: toBase64(encoder.encode("day")),
          byteSize: 3,
          lastModifiedMs: null,
        }),
    } satisfies DesktopImportClient;
    const source = new DesktopImportSource({ client, picker });

    const root = await source.selectRoot();
    expect(root).toMatchObject({ label: "202504", handle: { rootPath: "C:\\logs\\202504" } });

    const files = [];
    for await (const file of source.scan(root!)) {
      files.push(file);
    }

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      relativePath: "202504/20250401.txt",
      fileName: "20250401.txt",
      byteSize: 6,
      lastModified: 1_700_000_000_000,
      readError: null,
    });
    expect(new TextDecoder().decode(files[0]!.rawBytes!)).toBe("日志");
    expect(client.readTxtImport).toHaveBeenNthCalledWith(
      1,
      "C:\\logs\\202504",
      "202504/20250401.txt",
    );
    expect(client.readTxtImport).toHaveBeenNthCalledWith(
      2,
      "C:\\logs\\202504",
      "202504/20250402.txt",
    );
  });

  it("keeps a readable audit entry when one file cannot be read", async () => {
    const source = new DesktopImportSource({
      picker: async () => "/Users/me/logs",
      client: {
        scanTxtImport: async () => ({
          rootLabel: "logs",
          candidates: [
            {
              relativePath: "202504/20250401.txt",
              fileName: "20250401.txt",
              byteSize: 12,
              lastModifiedMs: 42,
            },
          ],
          ignoredEntryCount: 0,
        }),
        readTxtImport: async () => {
          throw new Error("permission denied");
        },
      },
    });

    const root = await source.selectRoot();
    const files = [];
    for await (const file of source.scan(root!)) {
      files.push(file);
    }

    expect(files[0]).toMatchObject({
      rawBytes: null,
      byteSize: 12,
      lastModified: 42,
      readError: {
        code: "FILE_READ_FAILED",
        message: "permission denied",
        retryable: true,
      },
    });
  });

  it("rejects an unsafe path returned by the desktop bridge", async () => {
    const readTxtImport = vi.fn();
    const source = new DesktopImportSource({
      picker: async () => "C:\\logs",
      client: {
        scanTxtImport: async () => ({
          rootLabel: "logs",
          candidates: [
            {
              relativePath: "../outside.txt",
              fileName: "outside.txt",
              byteSize: 1,
              lastModifiedMs: null,
            },
          ],
          ignoredEntryCount: 0,
        }),
        readTxtImport,
      },
    });

    const root = await source.selectRoot();
    const consume = async () => {
      for await (const file of source.scan(root!)) {
        // Consume the stream so the validation path executes.
        void file;
      }
    };

    await expect(consume()).rejects.toThrow(/traverse/i);
    expect(readTxtImport).not.toHaveBeenCalled();
  });
});

interface TestFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}

interface TestDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterableIterator<TestDirectoryHandle | TestFileHandle>;
}

function directory(
  name: string,
  entries: readonly (TestDirectoryHandle | TestFileHandle)[],
): TestDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *values() {
      yield* entries;
    },
  };
}

function file(name: string, body: string, lastModified = 123): TestFileHandle {
  return {
    kind: "file",
    name,
    async getFile() {
      return new File([body], name, { lastModified });
    },
  };
}

describe("WebImportSource", () => {
  it("recursively streams TXT files from a File System Access directory", async () => {
    const rootHandle = directory("logs", [
      file("ignore.md", "ignored"),
      directory("202504", [file("20250401.txt", "日志"), file("nested", "ignored")]),
    ]);
    const source = new WebImportSource({
      pickDirectory: async () => rootHandle,
    });

    const root = await source.selectRoot();
    expect(root).toMatchObject({ label: "logs" });

    const files = [];
    for await (const entry of source.scan(root!)) {
      files.push(entry);
    }

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      relativePath: "202504/20250401.txt",
      fileName: "20250401.txt",
      byteSize: 6,
      lastModified: 123,
      readError: null,
    });
    expect(new TextDecoder().decode(files[0]!.rawBytes!)).toBe("日志");
  });

  it("falls back to webkitdirectory files when the directory API is unavailable", async () => {
    const first = new File(["a"], "20250401.txt", {
      lastModified: 10,
    });
    Object.defineProperty(first, "webkitRelativePath", {
      value: "logs/202504/20250401.txt",
    });
    const second = new File(["b"], "20250402.txt", {
      lastModified: 20,
    });
    Object.defineProperty(second, "webkitRelativePath", {
      value: "logs/202504/20250402.txt",
    });
    const source = new WebImportSource({
      pickDirectory: async () => null,
      pickFallbackFiles: async () => [first, second],
    });

    const root = await source.selectRoot();
    expect(root).toMatchObject({ label: "logs" });

    const files = [];
    for await (const entry of source.scan(root!)) {
      files.push(entry);
    }

    expect(files.map((entry) => entry.relativePath)).toEqual([
      "202504/20250401.txt",
      "202504/20250402.txt",
    ]);
  });

  it("reports a per-file read failure and continues the batch", async () => {
    const rootHandle = directory("logs", [
      {
        kind: "file",
        name: "broken.txt",
        getFile: async () => {
          throw new Error("not readable");
        },
      },
      file("202504/20250402.txt", "next") as unknown as TestFileHandle,
    ]);
    const source = new WebImportSource({ pickDirectory: async () => rootHandle });
    const root = await source.selectRoot();

    const files = [];
    for await (const entry of source.scan(root!)) {
      files.push(entry);
    }

    expect(files).toHaveLength(2);
    expect(files[1]).toMatchObject({
      relativePath: "broken.txt",
      rawBytes: null,
      readError: { code: "FILE_READ_FAILED", retryable: true },
    });
    expect(files[0]).toMatchObject({ relativePath: "202504/20250402.txt" });
  });

  it("rejects an unsafe fallback relative path", async () => {
    const unsafe = new File(["bad"], "outside.txt");
    Object.defineProperty(unsafe, "webkitRelativePath", {
      value: "../outside.txt",
    });
    const source = new WebImportSource({
      pickDirectory: async () => null,
      pickFallbackFiles: async () => [unsafe],
    });
    await expect(source.selectRoot()).rejects.toThrow(/traverse/i);
  });
});

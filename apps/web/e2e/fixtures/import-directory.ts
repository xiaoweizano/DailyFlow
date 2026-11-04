import type { Page } from "@playwright/test";

interface FixtureDirectory {
  readonly name: string;
  readonly files: readonly FixtureFile[];
}

interface FixtureFile {
  readonly name: string;
  readonly bytes: readonly number[];
  readonly lastModified: number;
}

const encoder = new TextEncoder();

function utf8(text: string): readonly number[] {
  return [...encoder.encode(text)];
}

function utf8Bom(text: string): readonly number[] {
  return [0xef, 0xbb, 0xbf, ...utf8(text)];
}

const monthlyFixture: readonly FixtureDirectory[] = [
  {
    name: "202504",
    files: [
      {
        name: "20250403.txt",
        bytes: utf8("UTF-8 工作记录\n排查完成后记录解决方案。"),
        lastModified: Date.UTC(2025, 3, 3),
      },
      {
        name: "20250404.txt",
        bytes: utf8Bom("BOM 工作记录\n确认 UTF-8 BOM 可正确导入。"),
        lastModified: Date.UTC(2025, 3, 4),
      },
      {
        name: "notes.txt",
        bytes: utf8("没有日期文件名，应作为异常文件提示。"),
        lastModified: Date.UTC(2025, 3, 5),
      },
    ],
  },
  {
    name: "202505",
    files: [
      {
        name: "20250506.txt",
        bytes: [214, 208, 206, 196, 185, 164, 215, 247, 188, 199, 194, 188],
        lastModified: Date.UTC(2025, 4, 6),
      },
    ],
  },
  {
    name: "202610",
    files: [
      {
        name: "20261003.txt",
        bytes: utf8("同日期冲突文件\n导入时应允许建立新版本。"),
        lastModified: Date.UTC(2026, 9, 3),
      },
    ],
  },
];

export async function installTxtImportFixture(page: Page): Promise<void> {
  await page.addInitScript((directories) => {
    const createFileHandle = (entry: {
      name: string;
      bytes: readonly number[];
      lastModified: number;
    }) => ({
      kind: "file" as const,
      name: entry.name,
      async getFile() {
        return new File([new Uint8Array(entry.bytes)], entry.name, {
          type: "text/plain",
          lastModified: entry.lastModified,
        });
      },
    });

    const root = {
      kind: "directory" as const,
      name: "DailyFlowHistory",
      async *values() {
        for (const directory of directories) {
          yield {
            kind: "directory" as const,
            name: directory.name,
            async *values() {
              for (const file of directory.files) {
                yield createFileHandle(file);
              }
            },
          };
        }
      },
    };

    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => root,
    });
  }, monthlyFixture);
}

export async function installBrowserDownloadFallback(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        value: undefined,
      });
    } catch {
      // The fallback is only needed in browsers that expose the picker.
    }
  });
}

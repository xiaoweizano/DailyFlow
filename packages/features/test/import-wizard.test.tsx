// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  ImportCommitResult,
  ImportPreview,
  ImportPreviewEntry,
  ImportRoot,
  ImportService,
  Page,
  SavedJournalSnapshot,
  StoredAttachment,
} from "@dailyflow/application";
import { parseEntityId, parseLocalDate, parseRevision, parseUtcTimestamp } from "@dailyflow/domain";
import { type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { ImportPage } from "../src/data-management/import-page.js";

const SESSION_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c80");
const READY_ENTRY_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c81");
const CONFLICT_ENTRY_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c82");
const INVALID_ENTRY_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c83");
const NOW = parseUtcTimestamp("2026-11-03T02:30:00.000Z");

const root: ImportRoot = {
  label: "工作日志",
  handle: { fixture: true },
};

const readyEntry: ImportPreviewEntry = {
  entryId: READY_ENTRY_ID,
  relativePath: "202504/20250401.txt",
  fileName: "20250401.txt",
  detectedDate: parseLocalDate("2025-04-01"),
  encoding: "utf8-bom",
  newlineStyle: "crlf",
  rawCaptureStatus: "captured",
  fileSha256: "a".repeat(64),
  byteSize: 1_536,
  excerpt: "修复 WebView2 下载目录问题。",
  status: "ready",
  conflictKind: null,
  existingJournalId: null,
  existingRevision: null,
  errorCode: null,
  errorMessage: null,
  issue: null,
};

const conflictEntry: ImportPreviewEntry = {
  ...readyEntry,
  entryId: CONFLICT_ENTRY_ID,
  relativePath: "202504/20250402.txt",
  fileName: "20250402.txt",
  detectedDate: parseLocalDate("2025-04-02"),
  fileSha256: "b".repeat(64),
  byteSize: 2_048,
  excerpt: "排查 macOS 签名失败。",
  status: "conflict",
  conflictKind: "same_date_conflict",
  existingJournalId: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c84"),
  existingRevision: 3,
};

const invalidEntry: ImportPreviewEntry = {
  ...readyEntry,
  entryId: INVALID_ENTRY_ID,
  relativePath: "202504/notes.txt",
  fileName: "notes.txt",
  detectedDate: null,
  encoding: "unknown",
  newlineStyle: "unknown",
  rawCaptureStatus: "unavailable",
  fileSha256: null,
  byteSize: null,
  excerpt: "",
  status: "invalid",
  errorCode: "DATE_UNRESOLVED",
  errorMessage: "无法从文件路径识别日期",
  issue: {
    entryId: INVALID_ENTRY_ID,
    code: "DATE_UNRESOLVED",
    message: "无法从文件路径识别日期",
    retryable: false,
  },
};

const preview: ImportPreview = {
  session: {
    id: SESSION_ID,
    rootLabel: root.label,
    status: "preview_ready",
    options: { source: "txt" },
    revision: parseRevision(2),
    scannedCount: 3,
    readyCount: 1,
    importedCount: 0,
    skippedCount: 0,
    conflictCount: 1,
    invalidCount: 1,
    createdAt: NOW,
    completedAt: null,
    errorSummary: null,
  },
  entries: [readyEntry, conflictEntry, invalidEntry],
  counts: {
    scanned: 3,
    ready: 1,
    skipped: 0,
    conflicts: 1,
    invalid: 1,
  },
  estimatedBytes: 3_584,
  warnings: [invalidEntry.issue!],
};

function createImportService(overrides: Partial<ImportService> = {}): ImportService {
  return {
    selectRoot: vi.fn(async () => root),
    scan: vi.fn(async () =>
      (async function* () {
        yield* [];
      })(),
    ),
    createPreview: vi.fn(async () => preview),
    commit: vi.fn(async (): Promise<ImportCommitResult> => ({
      sessionId: SESSION_ID,
      status: "completed",
      importedCount: 2,
      skippedCount: 0,
      failedCount: 0,
    })),
    ...overrides,
  };
}

function createServices(imports: ImportService): AppRuntimeServices {
  return {
    ...createRuntimeSettingsStub(),
    analytics: createAnalyticsServicesStub(),
    backups: createBackupServicesStub(),
    exports: createExportServicesStub(),
    imports,
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      promote: vi.fn(async (): Promise<Result<never, AppError>> => {
        throw new Error("not used");
      }),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(async (): Promise<Result<SavedJournalSnapshot, AppError>> => {
        throw new Error("not used");
      }),
      list: vi.fn(async (): Promise<Page<never>> => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async (): Promise<Page<never>> => ({
        items: [],
        nextCursor: null,
      })),
      getVersion: vi.fn(async () => null),
      restore: vi.fn(),
    },
    search: {
      query: vi.fn(async () => ({
        items: [],
        nextCursor: null,
        indexState: "ready" as const,
      })),
      rebuild: vi.fn(),
    },
    lifecycle: {
      register: vi.fn(() => () => undefined),
      flushAll: vi.fn(async () => true),
    },
    attachments: {
      add: vi.fn(async (): Promise<Result<StoredAttachment, AppError>> => {
        throw new Error("not used");
      }),
      read: vi.fn(async () => new Uint8Array()),
    },
    tasks: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      create: vi.fn(),
      complete: vi.fn(),
      reopen: vi.fn(),
      update: vi.fn(),
    },
    timeline: {
      getCalendar: vi.fn(async () => []),
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  };
}

describe("TXT import wizard", () => {
  it("imports the selected TXT files through the six-step workflow", async () => {
    const imports = createImportService();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AppServicesProvider services={createServices(imports)}>
          <ImportPage />
        </AppServicesProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "选择 TXT 目录" }));
    expect(await screen.findByText("工作日志")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "扫描并生成预览" }));
    expect(await screen.findByRole("table", { name: "TXT 导入预览" })).toBeTruthy();
    expect(screen.getByText("202504/20250401.txt")).toBeTruthy();
    expect(screen.getByText("3,584 B")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "进入导入策略" }));
    await user.click(screen.getByRole("radio", { name: "同日期内容建立新版本" }));
    await user.click(screen.getByRole("button", { name: "确认导入 2 个文件" }));

    await waitFor(() =>
      expect(imports.commit).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        expectedSessionRevision: 2,
        selectedPaths: ["202504/20250401.txt", "202504/20250402.txt"],
        conflictPolicy: "new_version",
        committedAt: expect.any(String),
      }),
    );
    expect(await screen.findByRole("heading", { name: "导入完成" })).toBeTruthy();
    expect(screen.getByText("创建 2")).toBeTruthy();
    expect(screen.getByText("异常 1")).toBeTruthy();
  });
});

// @vitest-environment jsdom

import "./setup-dom.js";

import type { ExportDataOutcome, ExportEstimate, ExportOptions } from "@dailyflow/application";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExportPage } from "../src/data-management/export-page.js";
import type { ExportRuntimeServices } from "../src/data-management/export-services.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";

const estimate: ExportEstimate = {
  entityCount: 12,
  fileCount: 4,
  estimatedBytes: 4096,
};

function createExports(overrides: Partial<ExportRuntimeServices> = {}): ExportRuntimeServices {
  return {
    estimate: vi.fn(async () => estimate),
    run: vi.fn(async (): Promise<ExportDataOutcome> => ({
      status: "saved",
      artifact: {
        filename: "dailyflow-export-2026-11-03.zip",
        mediaType: "application/zip",
        bytes: new Uint8Array([1]),
        sha256: "a".repeat(64),
        fileCount: 4,
        entityCount: 12,
        totalUncompressedBytes: 8192,
      },
      saved: {
        filename: "dailyflow-export-2026-11-03.zip",
        bytesWritten: 1,
      },
    })),
    ...overrides,
  };
}

function createServices(exports: ExportRuntimeServices): AppRuntimeServices {
  return {
    ...createRuntimeSettingsStub(),
    analytics: createAnalyticsServicesStub(),
    backups: createBackupServicesStub(),
    exports,
    imports: createImportServicesStub(),
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(),
      save: vi.fn(),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async () => ({ items: [], nextCursor: null })),
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
      add: vi.fn(),
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

describe("export page", () => {
  it("estimates the selected scope and saves through the runtime service", async () => {
    const exports = createExports();
    const user = userEvent.setup();

    render(
      <AppServicesProvider services={createServices(exports)}>
        <ExportPage />
      </AppServicesProvider>,
    );

    expect(await screen.findByText("4,096 B")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("导出范围"), "knowledge");
    await user.click(screen.getByLabelText("包含已删除内容"));
    await user.click(screen.getByLabelText("包含附件文件"));
    await user.click(screen.getByLabelText("包含导入原始字节"));
    await user.click(screen.getByRole("button", { name: "生成并保存导出" }));

    const expectedOptions: ExportOptions = {
      scope: "knowledge",
      includeDeleted: true,
      includeAttachments: false,
      includeImportRawBytes: false,
    };
    await waitFor(() => expect(exports.run).toHaveBeenCalledWith(expectedOptions));
    expect(await screen.findByRole("heading", { name: "导出已保存" })).toBeTruthy();
    expect(screen.getByText("dailyflow-export-2026-11-03.zip")).toBeTruthy();
  });

  it("keeps the selected options visible when saving is cancelled", async () => {
    const exports = createExports({
      run: vi.fn(async () => ({ status: "cancelled" as const })),
    });
    const user = userEvent.setup();

    render(
      <AppServicesProvider services={createServices(exports)}>
        <ExportPage />
      </AppServicesProvider>,
    );

    await user.selectOptions(screen.getByLabelText("导出范围"), "tasks");
    await user.click(screen.getByRole("button", { name: "生成并保存导出" }));

    expect(await screen.findByRole("status", { name: "导出已取消" })).toBeTruthy();
    expect((screen.getByLabelText("导出范围") as HTMLSelectElement).value).toBe("tasks");
  });

  it("shows an actionable error and permits another attempt", async () => {
    const run = vi
      .fn<ExportRuntimeServices["run"]>()
      .mockRejectedValueOnce(new Error("磁盘空间不足"))
      .mockResolvedValueOnce({
        status: "cancelled",
      });
    const user = userEvent.setup();

    render(
      <AppServicesProvider services={createServices(createExports({ run }))}>
        <ExportPage />
      </AppServicesProvider>,
    );

    await user.click(screen.getByRole("button", { name: "生成并保存导出" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("磁盘空间不足");

    await user.click(screen.getByRole("button", { name: "重试导出" }));
    expect(await screen.findByRole("status", { name: "导出已取消" })).toBeTruthy();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

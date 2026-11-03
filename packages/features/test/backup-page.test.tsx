// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  BackupRestoreResult,
  BackupSourceFile,
  InspectedBackup,
} from "@dailyflow/application";
import { parseContentHash } from "@dailyflow/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { BackupPage } from "../src/data-management/backup-page.js";
import type { BackupRuntimeServices } from "../src/data-management/backup-services.js";
import { createAnalyticsServicesStub } from "./analytics-stub.js";
import {
  backupArtifactStub,
  backupManifestStub,
  createBackupServicesStub,
  inspectedBackupStub,
  restoredBackupStub,
} from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";

const selectedFile: BackupSourceFile = {
  filename: backupArtifactStub.filename,
  bytes: backupArtifactStub.bytes,
};

const inspectedWithData: InspectedBackup = {
  ...inspectedBackupStub,
  manifest: {
    ...backupManifestStub,
    entityCounts: {
      journals: 12,
      knowledgeItems: 4,
      tasks: 7,
    },
    attachmentCount: 3,
    rawImportFileCount: 5,
  },
};

function createBackups(overrides: Partial<BackupRuntimeServices> = {}): BackupRuntimeServices {
  return createBackupServicesStub({
    create: vi.fn(async () => ({
      status: "saved" as const,
      artifact: backupArtifactStub,
      saved: {
        filename: backupArtifactStub.filename,
        bytesWritten: backupArtifactStub.bytes.byteLength,
      },
    })),
    selectSource: vi.fn(async () => selectedFile),
    inspect: vi.fn(async () => inspectedWithData),
    restore: vi.fn(async () => restoredBackupStub),
    ...overrides,
  });
}

function createServices(backups: BackupRuntimeServices): AppRuntimeServices {
  return {
    ...createRuntimeSettingsStub(),
    analytics: createAnalyticsServicesStub(),
    backups,
    exports: createExportServicesStub(),
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
        indexState: "stale" as const,
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

function renderPage(backups: BackupRuntimeServices): void {
  render(
    <AppServicesProvider services={createServices(backups)}>
      <BackupPage />
    </AppServicesProvider>,
  );
}

describe("backup page", () => {
  it("creates a complete backup and reports the saved artifact", async () => {
    const backups = createBackups();
    const user = userEvent.setup();
    renderPage(backups);

    await user.click(screen.getByRole("button", { name: "创建完整备份" }));

    await waitFor(() => expect(backups.create).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "备份已保存" })).toBeTruthy();
    expect(screen.getByText(backupArtifactStub.filename)).toBeTruthy();
  });

  it("inspects a backup and restores only after explicit confirmation", async () => {
    const backups = createBackups();
    const user = userEvent.setup();
    renderPage(backups);

    await user.click(screen.getByRole("button", { name: "选择备份文件" }));

    expect(await screen.findByRole("heading", { name: "备份校验通过" })).toBeTruthy();
    expect(screen.getByText(selectedFile.filename)).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();

    const restoreButton = screen.getByRole("button", {
      name: "确认恢复并替换当前数据",
    }) as HTMLButtonElement;
    expect(restoreButton.disabled).toBe(true);
    expect(backups.restore).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("我已确认将用此备份替换当前本地数据"));
    expect(restoreButton.disabled).toBe(false);
    await user.click(restoreButton);

    await waitFor(() =>
      expect(backups.restore).toHaveBeenCalledWith(selectedFile, backupManifestStub.contentDigest),
    );
    expect(await screen.findByRole("heading", { name: "恢复完成" })).toBeTruthy();
  });

  it("keeps the inspected backup available when restore fails", async () => {
    const restore = vi
      .fn<BackupRuntimeServices["restore"]>()
      .mockRejectedValueOnce(new Error("附件文件冲突"))
      .mockResolvedValueOnce({
        ...restoredBackupStub,
        safetySnapshot: {
          fileName: "pre-restore.dailyflow-backup.zip",
          contentDigest: parseContentHash("b".repeat(64)),
        },
      } satisfies BackupRestoreResult);
    const backups = createBackups({ restore });
    const user = userEvent.setup();
    renderPage(backups);

    await user.click(screen.getByRole("button", { name: "选择备份文件" }));
    await screen.findByRole("heading", { name: "备份校验通过" });
    await user.click(screen.getByLabelText("我已确认将用此备份替换当前本地数据"));
    await user.click(screen.getByRole("button", { name: "确认恢复并替换当前数据" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("附件文件冲突");
    expect(screen.getByRole("heading", { name: "备份校验通过" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "重试恢复" }));
    expect(await screen.findByRole("heading", { name: "恢复完成" })).toBeTruthy();
  });

  it("reports cancellation without discarding the page", async () => {
    const backups = createBackups({
      selectSource: vi.fn(async () => null),
    });
    const user = userEvent.setup();
    renderPage(backups);

    await user.click(screen.getByRole("button", { name: "选择备份文件" }));

    expect(await screen.findByRole("status", { name: "已取消选择备份" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "备份校验通过" })).toBeNull();
  });
});

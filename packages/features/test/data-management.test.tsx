// @vitest-environment jsdom

import "./setup-dom.js";

import type {
  DataHealthReport,
  DataManagementRuntimeServices,
  SearchRebuildResult,
} from "../src/index.js";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UtcTimestamp } from "@dailyflow/domain";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppServicesProvider } from "../src/app-services-provider.js";
import { DataManagementPage } from "../src/data-management/data-management-page.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";

const report: DataHealthReport = {
  status: "attention",
  checkedAt: "2026-11-03T04:00:00.000Z" as UtcTimestamp,
  facts: {
    integrity: "ok",
    foreignKeyViolationCount: 0,
    duplicateJournalDateCount: 0,
    orphanedAttachmentCount: 1,
    invalidAttachmentLinkCount: 0,
    invalidTaskRelationCount: 0,
    indexedDocumentCount: 3,
    authoritativeDocumentCount: 3,
    staleProjectionCount: 1,
    staleIndexVersionCount: 0,
    searchIndexState: "stale",
    lastBackupAt: null,
  },
  storage: {
    storageKind: "indexeddb",
    locationLabel: "浏览器 IndexedDB · dailyflow-web",
    schemaVersion: 1,
    usageBytes: 4096,
    quotaBytes: 8192,
    persisted: true,
    journalCount: 2,
    knowledgeItemCount: 1,
    taskCount: 3,
    attachmentCount: 1,
    rawImportByteCount: 512,
    searchDocumentCount: 3,
    lastBackupAt: null,
  },
  issues: [
    {
      code: "stale_search_projections",
      severity: "warning",
      title: "搜索投影需要重建",
      detail: "有 1 个实体的投影版本过旧。",
      recommendation: "重建搜索索引后再检查。",
      count: 1,
    },
    {
      code: "orphaned_attachments",
      severity: "warning",
      title: "存在孤立附件",
      detail: "有 1 个附件没有被正文引用。",
      recommendation: "确认后清理孤立附件。",
      count: 1,
    },
  ],
};

function renderPage(services: DataManagementRuntimeServices): void {
  const runtime = {
    ...createRuntimeSettingsStub(),
    dataManagement: services,
  } as unknown as AppRuntimeServices;
  render(
    <AppServicesProvider services={runtime}>
      <MemoryRouter>
        <DataManagementPage />
      </MemoryRouter>
    </AppServicesProvider>,
  );
}

describe("DataManagementPage", () => {
  it("shows storage, health issues, logical location, and all management entries", async () => {
    const services: DataManagementRuntimeServices = {
      inspect: vi.fn(async () => report),
      rebuildSearchIndex: vi.fn(),
    };

    renderPage(services);

    expect(await screen.findByText("浏览器 IndexedDB · dailyflow-web")).toBeInTheDocument();
    expect(screen.getByText("搜索投影需要重建")).toBeInTheDocument();
    expect(screen.getByText("存在孤立附件")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /导入 TXT/ })).toHaveAttribute("href", "/data/import");
    expect(screen.getByRole("link", { name: /导出归档/ })).toHaveAttribute("href", "/data/export");
    expect(screen.getByRole("link", { name: /备份与恢复/ })).toHaveAttribute(
      "href",
      "/data/backup",
    );
    expect(screen.queryByText(/[A-Z]:\\|\/Users\/|\/home\//u)).not.toBeInTheDocument();
  });

  it("requires explicit confirmation and keeps progress and cancellation results visible", async () => {
    const user = userEvent.setup();
    let resolveRebuild: ((result: SearchRebuildResult) => void) | undefined;
    const rebuildSearchIndex = vi.fn(
      (options?: Parameters<DataManagementRuntimeServices["rebuildSearchIndex"]>[0]) =>
        new Promise<SearchRebuildResult>((resolve) => {
          options?.onProgress?.({
            phase: "indexing",
            processedCount: 2,
            totalCount: 4,
          });
          resolveRebuild = resolve;
        }),
    );
    const services: DataManagementRuntimeServices = {
      inspect: vi.fn(async () => report),
      rebuildSearchIndex,
    };

    renderPage(services);
    await screen.findByText("浏览器 IndexedDB · dailyflow-web");
    await user.click(screen.getByRole("button", { name: "检查并重建索引" }));

    expect(screen.getByText(/搜索正文、结构化块、知识和任务/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认重建" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "我了解重建期间不应关闭应用" }));
    await user.click(screen.getByRole("button", { name: "确认重建" }));

    expect(await screen.findByText("已处理 2 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消重建" })).toBeInTheDocument();
    resolveRebuild?.({
      indexedCount: 2,
      completedAt: "2026-11-03T04:01:00.000Z" as UtcTimestamp,
      status: "cancelled",
    });
    expect(await screen.findByText("索引重建已取消，旧索引保持不变。")).toBeInTheDocument();
    await waitFor(() => expect(rebuildSearchIndex).toHaveBeenCalledOnce());
  });
});

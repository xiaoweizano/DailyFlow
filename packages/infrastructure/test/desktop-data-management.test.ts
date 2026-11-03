import { parseUtcTimestamp } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopDataManagementPort } from "../src/desktop/desktop-data-management-port.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

const CHECKED_AT = parseUtcTimestamp("2026-11-03T04:00:00.000Z");

const snapshotDto = {
  facts: {
    integrity: "ok",
    foreignKeyViolationCount: 0,
    duplicateJournalDateCount: 0,
    orphanedAttachmentCount: 1,
    invalidAttachmentLinkCount: 0,
    invalidTaskRelationCount: 0,
    indexedDocumentCount: 3,
    authoritativeDocumentCount: 4,
    staleProjectionCount: 1,
    staleIndexVersionCount: 0,
    searchIndexState: "stale",
    lastBackupAt: CHECKED_AT,
  },
  storage: {
    storageKind: "sqlite",
    locationLabel: "Tauri 应用数据目录 · SQLite",
    schemaVersion: 3,
    usageBytes: 8192,
    quotaBytes: null,
    persisted: true,
    journalCount: 2,
    knowledgeItemCount: 1,
    taskCount: 3,
    attachmentCount: 1,
    rawImportByteCount: 1024,
    searchDocumentCount: 3,
    lastBackupAt: CHECKED_AT,
  },
} as const;

describe("desktop data management", () => {
  it("maps the native health inspection without exposing a filesystem path", async () => {
    const invoke = vi.fn<TauriInvoke>(async () => snapshotDto);
    const port = new DesktopDataManagementPort({
      client: new TauriCommandClient(invoke),
    });

    const snapshot = await port.inspect();

    expect(invoke).toHaveBeenCalledWith("data_health_inspect", {});
    expect(snapshot).toMatchObject(snapshotDto);
    expect(snapshot.storage.locationLabel).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//u);
  });
});

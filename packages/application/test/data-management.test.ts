import { parseUtcTimestamp } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import {
  checkDataHealth,
  rebuildSearchIndex,
  type DataHealthSnapshot,
  type DataManagementPort,
  type SearchPort,
} from "../src/index.js";

const checkedAt = parseUtcTimestamp("2026-11-03T04:00:00.000Z");

function unhealthySnapshot(): DataHealthSnapshot {
  return {
    facts: {
      integrity: "ok",
      foreignKeyViolationCount: 1,
      duplicateJournalDateCount: 1,
      orphanedAttachmentCount: 2,
      invalidAttachmentLinkCount: 3,
      invalidTaskRelationCount: 4,
      indexedDocumentCount: 6,
      authoritativeDocumentCount: 8,
      staleProjectionCount: 5,
      staleIndexVersionCount: 2,
      searchIndexState: "failed",
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
      attachmentCount: 2,
      rawImportByteCount: 512,
      searchDocumentCount: 6,
      lastBackupAt: null,
    },
  };
}

describe("data management health", () => {
  it("turns storage facts into actionable issues without mutating content", async () => {
    const snapshot = unhealthySnapshot();
    const port: DataManagementPort = {
      inspect: vi.fn(async () => snapshot),
    };

    const report = await checkDataHealth({
      port,
      clock: { nowUtc: () => checkedAt },
    });

    expect(report).toMatchObject({
      status: "critical",
      checkedAt,
      facts: snapshot.facts,
      storage: snapshot.storage,
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "foreign_key_violations",
        "duplicate_journal_dates",
        "orphaned_attachments",
        "invalid_attachment_links",
        "invalid_task_relations",
        "stale_search_projections",
        "stale_search_index_versions",
        "search_document_count_mismatch",
        "search_index_failed",
        "backup_not_observed",
      ]),
    );
    for (const issue of report.issues) {
      expect(issue.title.length).toBeGreaterThan(0);
      expect(issue.detail.length).toBeGreaterThan(0);
      expect(issue.recommendation.length).toBeGreaterThan(0);
      expect(issue.count).toBeGreaterThan(0);
    }
    expect(snapshot.facts.foreignKeyViolationCount).toBe(1);
    expect(port.inspect).toHaveBeenCalledOnce();
  });

  it("reports attention for recoverable warnings and healthy for clean storage", async () => {
    const warningPort: DataManagementPort = {
      inspect: async () => ({
        ...unhealthySnapshot(),
        facts: {
          ...unhealthySnapshot().facts,
          foreignKeyViolationCount: 0,
          duplicateJournalDateCount: 0,
          invalidAttachmentLinkCount: 0,
          invalidTaskRelationCount: 0,
          indexedDocumentCount: 8,
          staleProjectionCount: 1,
          staleIndexVersionCount: 0,
          searchIndexState: "ready",
        },
      }),
    };
    const cleanPort: DataManagementPort = {
      inspect: async () => ({
        ...unhealthySnapshot(),
        facts: {
          ...unhealthySnapshot().facts,
          foreignKeyViolationCount: 0,
          duplicateJournalDateCount: 0,
          orphanedAttachmentCount: 0,
          invalidAttachmentLinkCount: 0,
          invalidTaskRelationCount: 0,
          indexedDocumentCount: 8,
          staleProjectionCount: 0,
          staleIndexVersionCount: 0,
          searchIndexState: "ready",
          lastBackupAt: checkedAt,
        },
        storage: {
          ...unhealthySnapshot().storage,
          lastBackupAt: checkedAt,
        },
      }),
    };

    await expect(
      checkDataHealth({ port: warningPort, clock: { nowUtc: () => checkedAt } }),
    ).resolves.toMatchObject({ status: "attention" });
    await expect(
      checkDataHealth({ port: cleanPort, clock: { nowUtc: () => checkedAt } }),
    ).resolves.toMatchObject({ status: "healthy", issues: [] });
  });

  it("forwards rebuild progress and cancellation to the search port", async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    const result = {
      indexedCount: 4,
      completedAt: checkedAt,
      status: "cancelled" as const,
    };
    const search: SearchPort = {
      query: vi.fn(),
      rebuild: vi.fn(async (_scope, options) => {
        options?.onProgress?.({
          phase: "indexing",
          processedCount: 2,
          totalCount: 4,
        });
        expect(options?.signal).toBe(controller.signal);
        return result;
      }),
    };

    await expect(
      rebuildSearchIndex({
        search,
        scope: ["journal", "structured_block"],
        signal: controller.signal,
        onProgress,
      }),
    ).resolves.toBe(result);
    expect(search.rebuild).toHaveBeenCalledWith(
      ["journal", "structured_block"],
      expect.objectContaining({ signal: controller.signal, onProgress }),
    );
    expect(onProgress).toHaveBeenCalledWith({
      phase: "indexing",
      processedCount: 2,
      totalCount: 4,
    });
  });
});

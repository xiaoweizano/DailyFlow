import type {
  DataHealthSnapshot,
  DataManagementPort,
  SearchDocument,
} from "@dailyflow/application";
import { parseUtcTimestamp, type UtcTimestamp } from "@dailyflow/domain";

import type { DailyFlowDb } from "./db.js";
import { WEB_DATA_SCHEMA_VERSION } from "./migrations/0001-initial.js";

export interface DexieDataManagementPortOptions {
  readonly database: DailyFlowDb;
}

function countDuplicateDateGroups(
  journals: readonly { readonly journalDate: string; readonly deletedAt: unknown }[],
): number {
  const counts = new Map<string, number>();
  for (const journal of journals) {
    if (journal.deletedAt === null) {
      counts.set(journal.journalDate, (counts.get(journal.journalDate) ?? 0) + 1);
    }
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function documentKey(document: Pick<SearchDocument, "entityType" | "entityId">): string {
  return `${document.entityType}:${document.entityId}`;
}

export class DexieDataManagementPort implements DataManagementPort {
  private readonly database: DailyFlowDb;

  constructor(options: DexieDataManagementPortOptions) {
    this.database = options.database;
  }

  async inspect(): Promise<DataHealthSnapshot> {
    const database = this.database;
    const [
      journals,
      structuredBlocks,
      knowledgeItems,
      tasks,
      tags,
      journalTags,
      knowledgeTags,
      attachmentBlobs,
      attachmentLinks,
      importEntries,
      searchDocs,
      searchIndexState,
      schemaVersion,
      lastBackup,
      safetyBackup,
    ] = await Promise.all([
      database.journals.toArray(),
      database.structuredBlocks.toArray(),
      database.knowledgeItems.toArray(),
      database.tasks.toArray(),
      database.tags.toArray(),
      database.journalTags.toArray(),
      database.knowledgeTags.toArray(),
      database.attachmentBlobs.toArray(),
      database.attachmentLinks.toArray(),
      database.importEntries.toArray(),
      database.searchDocs.toArray(),
      database.meta.get("searchIndexState"),
      database.meta.get("dataSchemaVersion"),
      database.meta.get("lastBackupAt"),
      database.meta.get("lastRestoreSafetySnapshot"),
    ]);

    const activeJournals = journals.filter(
      (journal) => journal.deletedAt === null && journal.status === "active",
    );
    const journalById = new Map(activeJournals.map((journal) => [journal.id, journal] as const));
    const activeKnowledge = knowledgeItems.filter(
      (item) => item.deletedAt === null && item.status === "active",
    );
    const knowledgeById = new Map(activeKnowledge.map((item) => [item.id, item] as const));
    const tagIds = new Set(tags.map((tag) => tag.id));
    const activeTasks = tasks.filter((task) => task.deletedAt === null);
    const activeBlocks = structuredBlocks.filter(
      (block) => block.deletedAt === null && journalById.has(block.journalId),
    );

    const authoritativeDocuments: Array<
      Pick<SearchDocument, "entityType" | "entityId" | "updatedAt">
    > = [
      ...activeJournals.map((journal) => ({
        entityType: "journal" as const,
        entityId: journal.id,
        updatedAt: journal.updatedAt,
      })),
      ...activeKnowledge.map((item) => ({
        entityType: "knowledge_item" as const,
        entityId: item.id,
        updatedAt: item.updatedAt,
      })),
      ...activeTasks.map((task) => ({
        entityType: "task" as const,
        entityId: task.id,
        updatedAt: task.updatedAt,
      })),
      ...activeBlocks.map((block) => ({
        entityType: "structured_block" as const,
        entityId: block.id,
        updatedAt: block.updatedAt,
      })),
    ];
    const indexedByKey = new Map(
      searchDocs.map((document) => [documentKey(document), document] as const),
    );
    const staleProjectionCount = authoritativeDocuments.filter((document) => {
      const indexed = indexedByKey.get(documentKey(document));
      return indexed === undefined || indexed.updatedAt !== document.updatedAt;
    }).length;
    const staleIndexVersionCount = searchDocs.filter(
      (document) => document.indexVersion !== 1,
    ).length;

    let foreignKeyViolationCount = 0;
    foreignKeyViolationCount += journalTags.filter((link) => !tagIds.has(link.tagId)).length;
    foreignKeyViolationCount += knowledgeTags.filter(
      (link) => !tagIds.has(link.tagId) || !knowledgeById.has(link.knowledgeItemId),
    ).length;
    foreignKeyViolationCount += structuredBlocks.filter(
      (block) => block.deletedAt === null && !journalById.has(block.journalId),
    ).length;
    foreignKeyViolationCount += attachmentLinks.filter(
      (link) => link.deletedAt === null && !attachmentBlobs.some((blob) => blob.id === link.blobId),
    ).length;

    const invalidTaskRelationCount = activeTasks.filter(
      (task) =>
        (task.journalId !== null && !journalById.has(task.journalId)) ||
        (task.knowledgeItemId !== null && !knowledgeById.has(task.knowledgeItemId)),
    ).length;
    const activeLinks = attachmentLinks.filter((link) => link.deletedAt === null);
    const referencedBlobIds = new Set(activeLinks.map((link) => link.blobId));
    const orphanedAttachmentCount = attachmentBlobs.filter(
      (blob) => !referencedBlobIds.has(blob.id) || blob.orphanedAt !== null,
    ).length;
    const invalidAttachmentLinkCount = activeLinks.filter((link) => {
      const blobExists = attachmentBlobs.some((blob) => blob.id === link.blobId);
      const ownerExists =
        link.ownerType === "journal"
          ? journalById.has(link.ownerId)
          : link.ownerType === "knowledge_item"
            ? knowledgeById.has(link.ownerId)
            : false;
      return !blobExists || !ownerExists;
    }).length;

    const observedBackupAt = this.readBackupTimestamp(lastBackup?.value, safetyBackup?.value);
    const storageEstimate = await this.readStorageEstimate();
    const state =
      searchIndexState?.value === "stale" || searchIndexState?.value === "failed"
        ? searchIndexState.value
        : "ready";

    return {
      facts: {
        integrity: "ok",
        foreignKeyViolationCount,
        duplicateJournalDateCount: countDuplicateDateGroups(journals),
        orphanedAttachmentCount,
        invalidAttachmentLinkCount,
        invalidTaskRelationCount,
        indexedDocumentCount: searchDocs.length,
        authoritativeDocumentCount: authoritativeDocuments.length,
        staleProjectionCount,
        staleIndexVersionCount,
        searchIndexState: state,
        lastBackupAt: observedBackupAt,
      },
      storage: {
        storageKind: "indexeddb",
        locationLabel: "浏览器 IndexedDB · dailyflow-web",
        schemaVersion:
          typeof schemaVersion?.value === "number" ? schemaVersion.value : WEB_DATA_SCHEMA_VERSION,
        usageBytes: storageEstimate.usage,
        quotaBytes: storageEstimate.quota,
        persisted: storageEstimate.persisted,
        journalCount: activeJournals.length,
        knowledgeItemCount: activeKnowledge.length,
        taskCount: activeTasks.length,
        attachmentCount: activeLinks.length,
        rawImportByteCount: importEntries.reduce(
          (total, entry) => total + (entry.rawSize ?? entry.rawBytes?.byteLength ?? 0),
          0,
        ),
        searchDocumentCount: searchDocs.length,
        lastBackupAt: observedBackupAt,
      },
    };
  }

  private readBackupTimestamp(backupValue: unknown, safetyValue: unknown): UtcTimestamp | null {
    if (typeof backupValue === "string") {
      try {
        return parseUtcTimestamp(backupValue);
      } catch {
        return null;
      }
    }
    if (
      typeof safetyValue === "object" &&
      safetyValue !== null &&
      "createdAt" in safetyValue &&
      typeof safetyValue.createdAt === "string"
    ) {
      try {
        return parseUtcTimestamp(safetyValue.createdAt);
      } catch {
        return null;
      }
    }
    return null;
  }

  private async readStorageEstimate(): Promise<{
    readonly usage: number;
    readonly quota: number | null;
    readonly persisted: boolean;
  }> {
    const storage = (
      globalThis as typeof globalThis & {
        readonly navigator?: {
          readonly storage?: {
            estimate?: () => Promise<{ readonly usage?: number; readonly quota?: number }>;
            persisted?: () => Promise<boolean>;
          };
        };
      }
    ).navigator?.storage;
    if (storage === undefined) {
      return { usage: 0, quota: null, persisted: false };
    }
    const [estimate, persisted] = await Promise.all([
      storage.estimate?.() ?? Promise.resolve({}),
      storage.persisted?.() ?? Promise.resolve(false),
    ]);
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? null,
      persisted,
    };
  }
}

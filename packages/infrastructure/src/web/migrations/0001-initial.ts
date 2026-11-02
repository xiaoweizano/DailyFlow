import type { Transaction } from "dexie";

import type { MetaRow } from "../schema.js";

export const WEB_DATABASE_VERSION = 1;
export const WEB_DATA_SCHEMA_VERSION = 1;

export const WEB_DATABASE_STORES_V1 = {
  meta: "key",
  settings: "key",
  journals: "id, &[journalDate+deletedAt], updatedAt, journalDate, status, contentHash",
  journalVersions: "id, journalId, &[journalId+revision], createdAt",
  structuredBlocks: "id, journalId, [journalId+orderKey], blockType, deletedAt",
  tasks: "id, status, dueDate, updatedAt, journalId, deletedAt",
  knowledgeItems: "id, kind, status, updatedAt, title, sourceJournalId, deletedAt",
  knowledgeLinks: "id, sourceItemId, targetItemId, relationType",
  tags: "id, &nameNormalized",
  journalTags: "[journalId+tagId], journalId, tagId",
  knowledgeTags: "[knowledgeItemId+tagId], knowledgeItemId, tagId",
  attachmentBlobs: "id, &[sha256+byteSize], orphanedAt",
  attachmentLinks: "id, [ownerType+ownerId], blobId, deletedAt",
  importSessions: "id, status, createdAt, revision",
  importEntries: "id, sessionId, [sessionId+status], fileSha256",
  reports: "id, [periodType+periodStart+periodEnd+timezone], updatedAt, deletedAt",
  searchDocs: "id, [entityType+entityId], localDate, updatedAt, ownerEntityId",
  searchTermPostings: "id, term, docId, [term+docId]",
} as const;

export async function seedInitialMetadata(transaction: Transaction): Promise<void> {
  const meta = transaction.table<MetaRow, string>("meta");
  await meta.bulkPut([
    {
      key: "dataSchemaVersion",
      value: WEB_DATA_SCHEMA_VERSION,
    },
    {
      key: "searchIndexState",
      value: "ready",
    },
  ]);
}

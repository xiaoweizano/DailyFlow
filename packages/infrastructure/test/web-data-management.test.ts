import "fake-indexeddb/auto";

import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { DexieDataManagementPort } from "../src/web/dexie-data-management-port.js";
import { DexieSearchPort } from "../src/web/dexie-search-port.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c41");
const blockId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c42");
const knowledgeId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c43");
const taskId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c44");
const tagId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c45");
const timestamp = parseUtcTimestamp("2026-11-03T04:00:00.000Z");
const hash = parseContentHash("a".repeat(64));

const databases: DailyFlowDb[] = [];
let sequence = 0;

function createHarness() {
  sequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-data-management-${sequence}`);
  databases.push(database);
  const clock = { nowUtc: () => timestamp };
  return {
    database,
    search: new DexieSearchPort({ database, clock }),
    management: new DexieDataManagementPort({ database }),
  };
}

async function seedAuthority(database: DailyFlowDb): Promise<void> {
  await database.journals.put({
    id: journalId,
    journalDate: parseLocalDate("2026-11-03"),
    timezone: "Asia/Shanghai",
    title: "索引维护",
    contentJson: JSON.stringify({ type: "doc", content: [] }),
    editorSchemaVersion: 1,
    contentMarkdown: "索引维护",
    contentPlainText: "从权威日志重建搜索索引",
    contentHash: hash,
    projectionVersion: 1,
    excerpt: "从权威日志重建搜索索引",
    status: "active",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });
  await database.structuredBlocks.put({
    id: blockId,
    journalId,
    blockType: "solution",
    schemaVersion: 1,
    dataJson: "{}",
    orderKey: "000000000001",
    renderedText: "先备份旧索引，再原子替换。",
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });
  await database.knowledgeItems.put({
    id: knowledgeId,
    kind: "solution",
    status: "active",
    title: "失败保留旧索引",
    contentJson: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "取消时回滚" }] }],
    }),
    editorSchemaVersion: 1,
    contentHash: hash,
    projectionVersion: 1,
    summary: "取消时回滚",
    revision: 1,
    sourceJournalId: journalId,
    sourceBlockId: blockId,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });
  await database.tasks.put({
    id: taskId,
    title: "验证重建",
    descriptionJson: null,
    descriptionText: "检查正文在取消后仍可读",
    status: "open",
    priority: "normal",
    dueDate: parseLocalDate("2026-11-04"),
    completedAt: null,
    journalId,
    knowledgeItemId: knowledgeId,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });
  await database.tags.put({
    id: tagId,
    name: "恢复",
    nameNormalized: "恢复",
    color: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.journalTags.put({ journalId, tagId });
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe("Dexie data management", () => {
  it("inspects storage without exposing an absolute path", async () => {
    const { database, management } = createHarness();
    await seedAuthority(database);

    const snapshot = await management.inspect();

    expect(snapshot.storage).toMatchObject({
      storageKind: "indexeddb",
      locationLabel: "浏览器 IndexedDB · dailyflow-web",
      schemaVersion: 1,
      journalCount: 1,
      knowledgeItemCount: 1,
      taskCount: 1,
      rawImportByteCount: 0,
    });
    expect(snapshot.facts.authoritativeDocumentCount).toBe(4);
    expect(snapshot.storage.locationLabel).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//u);
  });

  it("rebuilds search documents from authoritative tables and fixes block identity", async () => {
    const { database, search, management } = createHarness();
    await seedAuthority(database);
    await database.meta.put({ key: "searchIndexState", value: "stale" });
    await database.searchDocs.put({
      id: journalId,
      ownerEntityId: journalId,
      entityType: "journal",
      entityId: journalId,
      title: "旧索引",
      bodyText: "old",
      structuredText: "",
      tagsText: "",
      normalizedText: "old",
      tokenizedText: "old",
      localDate: null,
      updatedAt: timestamp,
      contentHash: hash,
      indexVersion: 0,
    });

    const progress: Array<{ phase: string; processedCount: number; totalCount: number }> = [];
    const rebuilt = await search.rebuild(undefined, {
      onProgress: (value) => progress.push(value),
    });

    expect(rebuilt).toMatchObject({ indexedCount: 4, status: "completed" });
    expect(progress.at(-1)?.phase).toBe("committing");
    const documents = await database.searchDocs.toArray();
    expect(documents.map((document) => document.entityType).sort()).toEqual([
      "journal",
      "knowledge_item",
      "structured_block",
      "task",
    ]);
    expect(documents.find((document) => document.entityType === "structured_block")).toMatchObject({
      id: blockId,
      entityId: blockId,
      ownerEntityId: journalId,
    });
    await expect(management.inspect()).resolves.toMatchObject({
      facts: {
        indexedDocumentCount: 4,
        authoritativeDocumentCount: 4,
        searchIndexState: "ready",
      },
    });
  });

  it("keeps the previous index when rebuild is cancelled and does not mark it ready", async () => {
    const { database, search } = createHarness();
    await seedAuthority(database);
    await database.meta.put({ key: "searchIndexState", value: "stale" });
    await database.searchTermPostings.put({
      id: "old:posting",
      term: "old",
      docId: journalId,
      frequency: 1,
      field: "title",
    });
    const controller = new AbortController();
    controller.abort();

    const rebuilt = await search.rebuild(undefined, { signal: controller.signal });

    expect(rebuilt).toMatchObject({ indexedCount: 0, status: "cancelled" });
    await expect(database.searchTermPostings.get("old:posting")).resolves.toBeDefined();
    await expect(database.meta.get("searchIndexState")).resolves.toMatchObject({ value: "stale" });
  });

  it("keeps the previous index when authoritative projection fails", async () => {
    const { database, search } = createHarness();
    await seedAuthority(database);
    await database.knowledgeItems.put({
      ...(await database.knowledgeItems.get(knowledgeId))!,
      contentJson: "{not-json",
    });
    await database.searchTermPostings.put({
      id: "preserved:posting",
      term: "preserved",
      docId: journalId,
      frequency: 1,
      field: "title",
    });

    await expect(search.rebuild()).rejects.toThrow();
    await expect(database.searchTermPostings.get("preserved:posting")).resolves.toBeDefined();
  });
});

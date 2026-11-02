import {
  createContentDocument,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type KnowledgeItem,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopKnowledgeRepository } from "../src/desktop/desktop-knowledge-repository.js";
import { createDesktopServices } from "../src/desktop/desktop-services.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

const KNOWLEDGE_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2b");
const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const UPDATED_AT = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const knowledgeDto = {
  id: KNOWLEDGE_ID,
  kind: "issue",
  status: "active",
  title: "数据库连接超时",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "连接池耗尽" }] }],
  },
  editorSchemaVersion: 1,
  contentHash: null,
  projectionVersion: 1,
  summary: "连接池耗尽后扩容恢复",
  revision: 2,
  sourceJournalId: JOURNAL_ID,
  sourceBlockId: null,
  createdAt: UPDATED_AT,
  updatedAt: UPDATED_AT,
  deletedAt: null,
};

function createRepository(invoke: TauriInvoke): DesktopKnowledgeRepository {
  return new DesktopKnowledgeRepository({
    client: new TauriCommandClient(invoke),
    clock: { nowUtc: () => UPDATED_AT },
  });
}

function makeKnowledgeItem(): KnowledgeItem {
  return {
    id: KNOWLEDGE_ID,
    kind: "issue",
    status: "active",
    title: knowledgeDto.title,
    content: createContentDocument(1, knowledgeDto.contentJson),
    contentHash: null,
    projectionVersion: 1,
    summary: knowledgeDto.summary,
    revision: parseRevision(2),
    sourceJournalId: JOURNAL_ID,
    sourceBlockId: null,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    deletedAt: null,
  };
}

describe("DesktopKnowledgeRepository", () => {
  it("maps reads, filters, optimistic saves, and soft deletes to Tauri commands", async () => {
    const invoke = vi
      .fn<TauriInvoke>()
      .mockResolvedValueOnce(knowledgeDto)
      .mockResolvedValueOnce({ items: [knowledgeDto], nextCursor: "knowledge-cursor-2" })
      .mockResolvedValueOnce({ ...knowledgeDto, revision: 3 })
      .mockResolvedValueOnce(undefined);
    const knowledge = createRepository(invoke);

    const item = await knowledge.getById(KNOWLEDGE_ID);
    const page = await knowledge.list({
      kind: "issue",
      status: "active",
      fromDate: parseLocalDate("2026-10-01"),
      toDate: parseLocalDate("2026-10-31"),
      cursor: "knowledge-cursor-1",
      limit: 10,
    });
    const saved = await knowledge.save(makeKnowledgeItem(), 2);
    await knowledge.softDelete(KNOWLEDGE_ID, 3);

    expect(invoke).toHaveBeenNthCalledWith(1, "knowledge_get_by_id", {
      knowledgeItemId: KNOWLEDGE_ID,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "knowledge_list", {
      query: {
        kind: "issue",
        status: "active",
        fromDate: "2026-10-01",
        toDate: "2026-10-31",
        cursor: "knowledge-cursor-1",
        limit: 10,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "knowledge_save", {
      input: {
        item: expect.objectContaining({
          id: KNOWLEDGE_ID,
          kind: "issue",
          sourceJournalId: JOURNAL_ID,
          contentJson: knowledgeDto.contentJson,
        }),
        expectedRevision: 2,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "knowledge_soft_delete", {
      knowledgeItemId: KNOWLEDGE_ID,
      expectedRevision: 3,
      deletedAt: UPDATED_AT,
    });
    expect(item).toMatchObject({
      id: KNOWLEDGE_ID,
      kind: "issue",
      sourceJournalId: JOURNAL_ID,
      revision: 2,
    });
    expect(page).toMatchObject({
      items: [{ id: KNOWLEDGE_ID, title: knowledgeDto.title }],
      nextCursor: "knowledge-cursor-2",
    });
    expect(saved.revision).toBe(3);
  });

  it("is exposed by the Desktop composition root", () => {
    const services = createDesktopServices({ invoke: vi.fn<TauriInvoke>() });

    expect(services.knowledge).toBeInstanceOf(DesktopKnowledgeRepository);
  });
});

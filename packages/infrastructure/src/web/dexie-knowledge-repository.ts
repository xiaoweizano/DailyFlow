import type {
  KnowledgeListQuery,
  KnowledgeRepository,
  KnowledgeSummary,
  Page,
} from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type EntityId,
  type JsonObject,
  type KnowledgeItem,
} from "@dailyflow/domain";
import { stableStringify } from "@dailyflow/shared";

import { decodeCursor, encodeCursor, resolvePageSize } from "../memory/pagination-cursor.js";
import type { DailyFlowDb } from "./db.js";
import type { KnowledgeItemRow } from "./schema.js";

interface KnowledgeCursor {
  readonly updatedAt: string;
  readonly id: string;
}

export interface DexieKnowledgeRepositoryOptions {
  readonly database: DailyFlowDb;
  readonly clock: Clock;
}

function toKnowledgeItem(row: KnowledgeItemRow): KnowledgeItem {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    content: createContentDocument(
      row.editorSchemaVersion,
      JSON.parse(row.contentJson) as JsonObject,
    ),
    contentHash: row.contentHash,
    projectionVersion: row.projectionVersion,
    summary: row.summary,
    revision: parseRevision(row.revision),
    sourceJournalId: row.sourceJournalId,
    sourceBlockId: row.sourceBlockId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toRow(item: KnowledgeItem): KnowledgeItemRow {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    title: item.title,
    contentJson: stableStringify(item.content.doc),
    editorSchemaVersion: item.content.schemaVersion,
    contentHash: item.contentHash,
    projectionVersion: item.projectionVersion,
    summary: item.summary,
    revision: item.revision,
    sourceJournalId: item.sourceJournalId,
    sourceBlockId: item.sourceBlockId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  };
}

function toSummary(item: KnowledgeItem): KnowledgeSummary {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    revision: item.revision,
    updatedAt: item.updatedAt,
  };
}

function compareRows(left: KnowledgeItemRow, right: KnowledgeItemRow): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function isAfterCursor(row: KnowledgeItemRow, cursor: KnowledgeCursor): boolean {
  return row.updatedAt === cursor.updatedAt ? row.id < cursor.id : row.updatedAt < cursor.updatedAt;
}

function conflict(id: EntityId, expectedRevision: number | null, actualRevision?: number): never {
  throw new PortError("CONFLICT", {
    message: "Knowledge item revision conflict",
    entity: "knowledge_item",
    id,
    ...(expectedRevision === null ? {} : { expectedRevision }),
    ...(actualRevision === undefined ? {} : { actualRevision }),
  });
}

function notFound(id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: "Knowledge item not found",
    entity: "knowledge_item",
    id,
  });
}

export class DexieKnowledgeRepository implements KnowledgeRepository {
  private readonly database: DailyFlowDb;
  private readonly clock: Clock;

  constructor(options: DexieKnowledgeRepositoryOptions) {
    this.database = options.database;
    this.clock = options.clock;
  }

  async getById(id: EntityId): Promise<KnowledgeItem | null> {
    const row = await this.database.knowledgeItems.get(id);
    return row === undefined || row.deletedAt !== null ? null : toKnowledgeItem(row);
  }

  async list(query: KnowledgeListQuery): Promise<Page<KnowledgeSummary>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<KnowledgeCursor>(query.cursor);
    const status = query.status ?? "active";
    const records = (await this.database.knowledgeItems.toArray())
      .filter((row) => row.deletedAt === null && row.status === status)
      .filter((row) => query.kind === undefined || row.kind === query.kind)
      .filter((row) => query.fromDate === undefined || row.updatedAt.slice(0, 10) >= query.fromDate)
      .filter((row) => query.toDate === undefined || row.updatedAt.slice(0, 10) <= query.toDate)
      .filter((row) => cursor === null || isAfterCursor(row, cursor))
      .sort(compareRows);
    const selected = records.slice(0, limit + 1);
    const items = selected.slice(0, limit);
    const last = items.at(-1);

    return {
      items: items.map((row) => toSummary(toKnowledgeItem(row))),
      nextCursor:
        selected.length > limit && last !== undefined
          ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async save(item: KnowledgeItem, expectedRevision: number | null): Promise<KnowledgeItem> {
    return this.database.transaction("rw", this.database.knowledgeItems, async () => {
      const current = await this.database.knowledgeItems.get(item.id);
      if (expectedRevision === null) {
        if (current !== undefined) {
          return conflict(item.id, expectedRevision, current.revision);
        }
      } else if (current === undefined || current.deletedAt !== null) {
        return notFound(item.id);
      } else if (current.revision !== expectedRevision) {
        return conflict(item.id, expectedRevision, current.revision);
      }

      const saved: KnowledgeItem = {
        ...item,
        revision: parseRevision((current?.revision ?? 0) + 1),
        createdAt: current?.createdAt ?? item.createdAt,
        deletedAt: null,
      };
      await this.database.knowledgeItems.put(toRow(saved));
      return saved;
    });
  }

  async softDelete(id: EntityId, expectedRevision: number): Promise<void> {
    await this.database.transaction("rw", this.database.knowledgeItems, async () => {
      const current = await this.database.knowledgeItems.get(id);
      if (current === undefined || current.deletedAt !== null) {
        return notFound(id);
      }
      if (current.revision !== expectedRevision) {
        return conflict(id, expectedRevision, current.revision);
      }

      const deletedAt = parseUtcTimestamp(this.clock.nowUtc());
      await this.database.knowledgeItems.put({
        ...current,
        status: "archived",
        revision: parseRevision(current.revision + 1),
        updatedAt: deletedAt,
        deletedAt,
      });
    });
  }
}

import type {
  KnowledgeListQuery,
  KnowledgeRepository,
  KnowledgeSummary,
  Page,
} from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import {
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type EntityId,
  type KnowledgeItem,
} from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "./pagination-cursor.js";

interface KnowledgeCursor {
  readonly updatedAt: string;
  readonly id: string;
}

function compareKnowledgeItems(left: KnowledgeItem, right: KnowledgeItem): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function isAfterCursor(item: KnowledgeItem, cursor: KnowledgeCursor): boolean {
  if (item.updatedAt !== cursor.updatedAt) {
    return item.updatedAt < cursor.updatedAt;
  }

  return item.id < cursor.id;
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

function conflict(expectedRevision: number, actualRevision: number, id: EntityId): never {
  throw new PortError("CONFLICT", {
    message: "Knowledge item revision conflict",
    entity: "knowledge_item",
    id,
    expectedRevision,
    actualRevision,
  });
}

function notFound(id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: "Knowledge item not found",
    entity: "knowledge_item",
    id,
  });
}

export class MemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly items = new Map<EntityId, KnowledgeItem>();

  constructor(private readonly dependencies: { readonly clock: Clock }) {}

  async getById(id: EntityId): Promise<KnowledgeItem | null> {
    const item = this.items.get(id);
    return item === undefined || item.deletedAt !== null ? null : item;
  }

  async list(query: KnowledgeListQuery): Promise<Page<KnowledgeSummary>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<KnowledgeCursor>(query.cursor);
    const status = query.status ?? "active";
    const records = [...this.items.values()]
      .filter((item) => item.deletedAt === null && item.status === status)
      .filter((item) => query.kind === undefined || item.kind === query.kind)
      .filter(
        (item) => query.fromDate === undefined || item.updatedAt.slice(0, 10) >= query.fromDate,
      )
      .filter((item) => query.toDate === undefined || item.updatedAt.slice(0, 10) <= query.toDate)
      .filter((item) => cursor === null || isAfterCursor(item, cursor))
      .sort(compareKnowledgeItems);

    const page = records.slice(0, limit + 1);
    const items = page.slice(0, limit);
    const last = items.at(-1);

    return {
      items: items.map(toSummary),
      nextCursor:
        page.length > limit && last !== undefined
          ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async save(item: KnowledgeItem, expectedRevision: number | null): Promise<KnowledgeItem> {
    const current = this.items.get(item.id);
    this.assertExpectedRevision(item.id, current, expectedRevision);

    const saved: KnowledgeItem = {
      ...item,
      revision: parseRevision((current?.revision ?? 0) + 1),
      createdAt: current?.createdAt ?? item.createdAt,
      deletedAt: null,
    };
    this.items.set(item.id, saved);

    return saved;
  }

  async softDelete(id: EntityId, expectedRevision: number): Promise<void> {
    const current = this.items.get(id);
    if (current === undefined || current.deletedAt !== null) {
      return notFound(id);
    }
    if (current.revision !== expectedRevision) {
      return conflict(expectedRevision, current.revision, id);
    }

    const deletedAt = parseUtcTimestamp(this.dependencies.clock.nowUtc());
    this.items.set(id, {
      ...current,
      status: "archived",
      revision: parseRevision(current.revision + 1),
      updatedAt: deletedAt,
      deletedAt,
    });
  }

  private assertExpectedRevision(
    id: EntityId,
    current: KnowledgeItem | undefined,
    expectedRevision: number | null,
  ): void {
    if (expectedRevision === null) {
      if (current !== undefined) {
        throw new PortError("CONFLICT", {
          message: "Knowledge item already exists",
          entity: "knowledge_item",
          id,
          actualRevision: current.revision,
        });
      }
      return;
    }
    if (current === undefined || current.deletedAt !== null) {
      return notFound(id);
    }
    if (current.revision !== expectedRevision) {
      return conflict(expectedRevision, current.revision, id);
    }
  }
}

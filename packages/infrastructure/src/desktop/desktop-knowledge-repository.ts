import type {
  KnowledgeListQuery,
  KnowledgeRepository,
  KnowledgeSummary,
  Page,
} from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type EntityId,
  type KnowledgeItem,
} from "@dailyflow/domain";

import type { TauriCommandClient } from "./tauri-client.js";
import type { KnowledgeItemDto, KnowledgeListQueryDto } from "./tauri-contracts.js";

export interface DesktopKnowledgeRepositoryOptions {
  readonly client: TauriCommandClient;
  readonly clock: Clock;
}

function toKnowledgeItem(dto: KnowledgeItemDto): KnowledgeItem {
  return {
    id: dto.id,
    kind: dto.kind,
    status: dto.status,
    title: dto.title,
    content: createContentDocument(dto.editorSchemaVersion, dto.contentJson),
    contentHash: dto.contentHash,
    projectionVersion: dto.projectionVersion,
    summary: dto.summary,
    revision: parseRevision(dto.revision),
    sourceJournalId: dto.sourceJournalId,
    sourceBlockId: dto.sourceBlockId,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toKnowledgeItemDto(item: KnowledgeItem): KnowledgeItemDto {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    title: item.title,
    contentJson: item.content.doc,
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

function toKnowledgeListQueryDto(query: KnowledgeListQuery): KnowledgeListQueryDto {
  return {
    ...(query.kind === undefined ? {} : { kind: query.kind }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.fromDate === undefined ? {} : { fromDate: query.fromDate }),
    ...(query.toDate === undefined ? {} : { toDate: query.toDate }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
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

export class DesktopKnowledgeRepository implements KnowledgeRepository {
  private readonly client: TauriCommandClient;
  private readonly clock: Clock;

  constructor(options: DesktopKnowledgeRepositoryOptions) {
    this.client = options.client;
    this.clock = options.clock;
  }

  async getById(id: EntityId): Promise<KnowledgeItem | null> {
    const dto = await this.client.getKnowledgeById(id);
    return dto === null ? null : toKnowledgeItem(dto);
  }

  async list(query: KnowledgeListQuery): Promise<Page<KnowledgeSummary>> {
    const page = await this.client.listKnowledge(toKnowledgeListQueryDto(query));
    return {
      items: page.items.map((dto) => toSummary(toKnowledgeItem(dto))),
      nextCursor: page.nextCursor,
    };
  }

  async save(item: KnowledgeItem, expectedRevision: number | null): Promise<KnowledgeItem> {
    const dto = await this.client.saveKnowledge({
      item: toKnowledgeItemDto(item),
      expectedRevision,
    });
    return toKnowledgeItem(dto);
  }

  async softDelete(id: EntityId, expectedRevision: number): Promise<void> {
    await this.client.softDeleteKnowledge({
      knowledgeItemId: id,
      expectedRevision,
      deletedAt: parseUtcTimestamp(this.clock.nowUtc()),
    });
  }
}

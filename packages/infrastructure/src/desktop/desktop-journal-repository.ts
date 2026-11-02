import {
  type JournalListQuery,
  type JournalRepository,
  type JournalSaveState,
  type JournalSummary,
  type JournalVersionSummary,
  type Page,
  type PageRequest,
  type RestoreJournalVersionInput,
  type SavedJournalSnapshot,
  type SaveJournalSnapshot,
} from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  parseUtcTimestamp,
  type Clock,
  type Journal,
  type JournalVersion,
} from "@dailyflow/domain";

import type { TauriCommandClient } from "./tauri-client.js";
import type {
  JournalDto,
  JournalListQueryDto,
  JournalSaveStateDto,
  JournalSummaryDto,
  JournalVersionDto,
  JournalVersionSummaryDto,
  SavedJournalSnapshotDto,
  SaveJournalSnapshotDto,
} from "./tauri-contracts.js";

export interface DesktopJournalRepositoryOptions {
  readonly client: TauriCommandClient;
  readonly clock: Clock;
}

function toJournal(dto: JournalDto): Journal {
  return {
    id: dto.id,
    journalDate: dto.journalDate,
    timezone: dto.timezone,
    title: dto.title,
    content: createContentDocument(dto.editorSchemaVersion, dto.contentJson),
    contentMarkdown: dto.contentMarkdown,
    contentPlainText: dto.contentPlainText,
    contentHash: dto.contentHash,
    projectionVersion: dto.projectionVersion,
    excerpt: dto.excerpt,
    status: dto.status,
    revision: parseRevision(dto.revision),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toJournalSaveState(dto: JournalSaveStateDto): JournalSaveState {
  return {
    journalId: dto.journalId,
    journalDate: dto.journalDate,
    timezone: dto.timezone,
    revision: dto.revision,
    title: dto.title,
    contentHash: dto.contentHash,
    projectionVersion: dto.projectionVersion,
    tags: dto.tags,
    updatedAt: dto.updatedAt,
  };
}

function toJournalSummary(dto: JournalSummaryDto): JournalSummary {
  return {
    id: dto.id,
    journalDate: dto.journalDate,
    title: dto.title,
    excerpt: dto.excerpt,
    revision: dto.revision,
    updatedAt: dto.updatedAt,
  };
}

function toJournalVersionSummary(dto: JournalVersionSummaryDto): JournalVersionSummary {
  return {
    journalId: dto.journalId,
    revision: dto.revision,
    title: dto.title,
    changeSource: dto.changeSource,
    createdAt: dto.createdAt,
  };
}

function toJournalVersion(dto: JournalVersionDto): JournalVersion {
  return {
    id: dto.id,
    journalId: dto.journalId,
    revision: parseRevision(dto.revision),
    title: dto.title,
    content: createContentDocument(dto.editorSchemaVersion, dto.contentJson),
    contentHash: dto.contentHash,
    projectionVersion: dto.projectionVersion,
    changeSource: dto.changeSource,
    createdAt: dto.createdAt,
  };
}

function toSavedSnapshot(dto: SavedJournalSnapshotDto): SavedJournalSnapshot {
  return {
    journalId: dto.journalId,
    revision: dto.revision,
    savedAt: dto.savedAt,
    contentHash: dto.contentHash,
    versionCreated: dto.versionCreated,
    searchIndexState: dto.searchIndexState,
  };
}

function toSaveSnapshotDto(input: SaveJournalSnapshot): SaveJournalSnapshotDto {
  return {
    journalId: input.journalId,
    journalDate: input.journalDate,
    timezone: input.timezone,
    title: input.title,
    contentJson: input.contentJson,
    editorSchemaVersion: input.editorSchemaVersion,
    contentMarkdown: input.contentMarkdown,
    contentPlainText: input.contentPlainText,
    contentHash: input.contentHash,
    projectionVersion: input.projectionVersion,
    excerpt: input.excerpt,
    expectedRevision: input.expectedRevision,
    checkpoint: input.checkpoint,
    tags: [...input.tags],
    structuredBlocks: input.structuredBlocks.map((block) => ({
      id: block.id,
      blockType: block.blockType,
      schemaVersion: block.schemaVersion,
      data: block.data,
      orderKey: block.orderKey,
      renderedText: block.renderedText,
    })),
    searchDocuments: input.searchDocuments.map((document) => ({
      id: document.id,
      entityType: document.entityType,
      entityId: document.entityId,
      title: document.title,
      bodyText: document.bodyText,
      structuredText: document.structuredText,
      tagsText: document.tagsText,
      normalizedText: document.normalizedText,
      tokenizedText: document.tokenizedText,
      localDate: document.localDate,
      updatedAt: document.updatedAt,
      contentHash: document.contentHash,
      indexVersion: document.indexVersion,
    })),
    savedAt: input.savedAt,
  };
}

function toJournalListQueryDto(query: JournalListQuery): JournalListQueryDto {
  return {
    ...(query.fromDate === undefined ? {} : { fromDate: query.fromDate }),
    ...(query.toDate === undefined ? {} : { toDate: query.toDate }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

export class DesktopJournalRepository implements JournalRepository {
  private readonly client: TauriCommandClient;
  private readonly clock: Clock;

  constructor(options: DesktopJournalRepositoryOptions) {
    this.client = options.client;
    this.clock = options.clock;
  }

  async getByDate(date: Journal["journalDate"]): Promise<Journal | null> {
    const dto = await this.client.getJournalByDate(date);
    return dto === null ? null : toJournal(dto);
  }

  async getById(id: Journal["id"]): Promise<Journal | null> {
    const dto = await this.client.getJournalById(id);
    return dto === null ? null : toJournal(dto);
  }

  async getSaveState(journalId: Journal["id"]): Promise<JournalSaveState | null> {
    const dto = await this.client.getJournalSaveState(journalId);
    return dto === null ? null : toJournalSaveState(dto);
  }

  async listSummaries(query: JournalListQuery): Promise<Page<JournalSummary>> {
    const page = await this.client.listJournalSummaries(toJournalListQueryDto(query));
    return {
      items: page.items.map(toJournalSummary),
      nextCursor: page.nextCursor,
    };
  }

  async saveSnapshot(input: SaveJournalSnapshot): Promise<SavedJournalSnapshot> {
    const saved = await this.client.saveJournalSnapshot(toSaveSnapshotDto(input));
    return toSavedSnapshot(saved);
  }

  async listVersions(
    journalId: Journal["id"],
    page: PageRequest,
  ): Promise<Page<JournalVersionSummary>> {
    const result = await this.client.listJournalVersions(journalId, page.limit, page.cursor);
    return {
      items: result.items.map(toJournalVersionSummary),
      nextCursor: result.nextCursor,
    };
  }

  async getVersion(journalId: Journal["id"], revision: number): Promise<JournalVersion | null> {
    const dto = await this.client.getJournalVersion(journalId, revision);
    return dto === null ? null : toJournalVersion(dto);
  }

  async restoreVersion(input: RestoreJournalVersionInput): Promise<SavedJournalSnapshot> {
    const restored = await this.client.restoreJournalVersion(input);
    return toSavedSnapshot(restored);
  }

  async softDelete(journalId: Journal["id"], expectedRevision: number): Promise<void> {
    const deletedAt = parseUtcTimestamp(this.clock.nowUtc());
    await this.client.softDeleteJournal(journalId, expectedRevision, deletedAt);
  }
}

import type {
  JournalListQuery,
  JournalRepository,
  JournalSaveState,
  JournalSummary,
  JournalVersionSummary,
  Page,
  PageRequest,
  RestoreJournalVersionInput,
  SavedJournalSnapshot,
  SaveJournalSnapshot,
  SearchDocument,
  StructuredBlockProjection,
} from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import {
  createContentDocument,
  parseEntityId,
  parseRevision,
  parseUtcTimestamp,
  type ChangeSource,
  type Clock,
  type ContentDocument,
  type ContentHash,
  type EntityId,
  type IdGenerator,
  type Journal,
  type JournalStatus,
  type JournalVersion,
  type LocalDate,
  type UtcTimestamp,
} from "@dailyflow/domain";

import type { SearchIndexWriter } from "./memory-search-port.js";
import { decodeCursor, encodeCursor, resolvePageSize } from "./pagination-cursor.js";

interface MemoryJournalRecord {
  readonly journalId: EntityId;
  readonly journalDate: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly content: ContentDocument;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly tags: readonly string[];
  readonly structuredBlocks: readonly StructuredBlockProjection[];
  readonly status: JournalStatus;
  readonly revision: number;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

interface MemoryJournalVersionRecord {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly revision: number;
  readonly title: string;
  readonly content: ContentDocument;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly tags: readonly string[];
  readonly structuredBlocks: readonly StructuredBlockProjection[];
  readonly searchDocuments: readonly SearchDocument[];
  readonly changeSource: ChangeSource;
  readonly createdAt: UtcTimestamp;
}

interface JournalCursor {
  readonly journalDate: string;
  readonly id: string;
}

interface VersionCursor {
  readonly revision: number;
}

function versionKey(journalId: EntityId, revision: number): string {
  return `${journalId}:${revision}`;
}

function conflict(
  entity: string,
  id: EntityId,
  expectedRevision: number,
  actualRevision: number,
): never {
  throw new PortError("CONFLICT", {
    message: `${entity} revision conflict`,
    entity,
    id,
    expectedRevision,
    actualRevision,
  });
}

function notFound(entity: string, id: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: `${entity} not found`,
    entity,
    id,
  });
}

function toJournal(record: MemoryJournalRecord): Journal {
  return {
    id: record.journalId,
    journalDate: record.journalDate,
    timezone: record.timezone,
    title: record.title,
    content: record.content,
    contentMarkdown: record.contentMarkdown,
    contentPlainText: record.contentPlainText,
    contentHash: record.contentHash,
    projectionVersion: record.projectionVersion,
    excerpt: record.excerpt,
    status: record.status,
    revision: parseRevision(record.revision),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
}

function toJournalVersion(record: MemoryJournalVersionRecord): JournalVersion {
  return {
    id: record.id,
    journalId: record.journalId,
    revision: parseRevision(record.revision),
    title: record.title,
    content: record.content,
    contentHash: record.contentHash,
    projectionVersion: record.projectionVersion,
    changeSource: record.changeSource,
    createdAt: record.createdAt,
  };
}

function compareJournalRecords(left: MemoryJournalRecord, right: MemoryJournalRecord): number {
  if (left.journalDate !== right.journalDate) {
    return left.journalDate < right.journalDate ? 1 : -1;
  }

  return left.journalId < right.journalId ? 1 : left.journalId > right.journalId ? -1 : 0;
}

function isJournalAfterCursor(record: MemoryJournalRecord, cursor: JournalCursor): boolean {
  if (record.journalDate !== cursor.journalDate) {
    return record.journalDate < cursor.journalDate;
  }

  return record.journalId < cursor.id;
}

function toJournalSummary(record: MemoryJournalRecord): JournalSummary {
  return {
    id: record.journalId,
    journalDate: record.journalDate,
    title: record.title,
    excerpt: record.excerpt,
    revision: record.revision,
    updatedAt: record.updatedAt,
  };
}

function toVersionSummary(record: MemoryJournalVersionRecord): JournalVersionSummary {
  return {
    journalId: record.journalId,
    revision: record.revision,
    title: record.title,
    changeSource: record.changeSource,
    createdAt: record.createdAt,
  };
}

export class MemoryJournalRepository implements JournalRepository {
  private readonly journals = new Map<EntityId, MemoryJournalRecord>();
  private readonly versions = new Map<string, MemoryJournalVersionRecord>();

  constructor(
    private readonly dependencies: {
      readonly ids: IdGenerator;
      readonly clock: Clock;
      readonly search: SearchIndexWriter;
    },
  ) {}

  async getByDate(date: LocalDate): Promise<Journal | null> {
    const record = [...this.journals.values()].find(
      (candidate) =>
        candidate.deletedAt === null &&
        candidate.status === "active" &&
        candidate.journalDate === date,
    );

    return record === undefined ? null : toJournal(record);
  }

  async getById(id: EntityId): Promise<Journal | null> {
    const record = this.journals.get(id);
    return record === undefined || record.deletedAt !== null ? null : toJournal(record);
  }

  async getSaveState(journalId: EntityId): Promise<JournalSaveState | null> {
    const record = this.journals.get(journalId);
    if (record === undefined || record.deletedAt !== null) {
      return null;
    }

    return {
      journalId: record.journalId,
      journalDate: record.journalDate,
      timezone: record.timezone,
      revision: record.revision,
      title: record.title,
      contentHash: record.contentHash,
      projectionVersion: record.projectionVersion,
      tags: record.tags,
      updatedAt: record.updatedAt,
    };
  }

  async listSummaries(query: JournalListQuery): Promise<Page<JournalSummary>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<JournalCursor>(query.cursor);
    const status = query.status ?? "active";
    const records = [...this.journals.values()]
      .filter((record) => record.deletedAt === null && record.status === status)
      .filter((record) => query.fromDate === undefined || record.journalDate >= query.fromDate)
      .filter((record) => query.toDate === undefined || record.journalDate <= query.toDate)
      .filter((record) => cursor === null || isJournalAfterCursor(record, cursor))
      .sort(compareJournalRecords);

    const page = records.slice(0, limit + 1);
    const items = page.slice(0, limit);
    const last = items.at(-1);

    return {
      items: items.map(toJournalSummary),
      nextCursor:
        page.length > limit && last !== undefined
          ? encodeCursor({ journalDate: last.journalDate, id: last.journalId })
          : null,
    };
  }

  async saveSnapshot(input: SaveJournalSnapshot): Promise<SavedJournalSnapshot> {
    const current = this.journals.get(input.journalId);
    this.assertExpectedRevision(input.journalId, current, input.expectedRevision);

    const conflictingDate = [...this.journals.values()].find(
      (record) =>
        record.deletedAt === null &&
        record.journalDate === input.journalDate &&
        record.journalId !== input.journalId,
    );
    if (conflictingDate !== undefined) {
      throw new PortError("CONFLICT", {
        message: "An active journal already exists for this date",
        entity: "journal",
        id: input.journalId,
        actualRevision: conflictingDate.revision,
      });
    }

    const revision = (current?.revision ?? 0) + 1;
    const versionCreated = input.checkpoint !== "autosave";
    const content = createContentDocument(input.editorSchemaVersion, input.contentJson);
    const record: MemoryJournalRecord = {
      journalId: input.journalId,
      journalDate: input.journalDate,
      timezone: input.timezone,
      title: input.title,
      content,
      contentMarkdown: input.contentMarkdown,
      contentPlainText: input.contentPlainText,
      contentHash: input.contentHash,
      projectionVersion: input.projectionVersion,
      excerpt: input.excerpt,
      tags: input.tags,
      structuredBlocks: input.structuredBlocks,
      status: "active",
      revision,
      createdAt: current?.createdAt ?? input.savedAt,
      updatedAt: input.savedAt,
      deletedAt: null,
    };

    await this.dependencies.search.replaceDocuments(input.journalId, input.searchDocuments);
    this.journals.set(input.journalId, record);

    if (versionCreated) {
      const version = this.createVersionRecord(input, record, revision, input.checkpoint);
      this.versions.set(versionKey(input.journalId, revision), version);
    }

    return {
      journalId: input.journalId,
      revision,
      savedAt: input.savedAt,
      contentHash: input.contentHash,
      versionCreated,
      searchIndexState: "ready",
    };
  }

  async listVersions(journalId: EntityId, page: PageRequest): Promise<Page<JournalVersionSummary>> {
    const limit = resolvePageSize(page.limit);
    const cursor = page.cursor === undefined ? null : decodeCursor<VersionCursor>(page.cursor);
    const records = [...this.versions.values()]
      .filter((version) => version.journalId === journalId)
      .filter((version) => cursor === null || version.revision < cursor.revision)
      .sort((left, right) => right.revision - left.revision);
    const selected = records.slice(0, limit + 1);
    const items = selected.slice(0, limit);
    const last = items.at(-1);

    return {
      items: items.map(toVersionSummary),
      nextCursor:
        selected.length > limit && last !== undefined
          ? encodeCursor({ revision: last.revision })
          : null,
    };
  }

  async getVersion(journalId: EntityId, revision: number): Promise<JournalVersion | null> {
    const record = this.versions.get(versionKey(journalId, revision));
    return record === undefined ? null : toJournalVersion(record);
  }

  async restoreVersion(input: RestoreJournalVersionInput): Promise<SavedJournalSnapshot> {
    const current = this.journals.get(input.journalId);
    if (current === undefined || current.deletedAt !== null) {
      return notFound("journal", input.journalId);
    }
    if (current.revision !== input.expectedCurrentRevision) {
      return conflict("journal", input.journalId, input.expectedCurrentRevision, current.revision);
    }

    const target = this.versions.get(versionKey(input.journalId, input.versionRevision));
    if (target === undefined) {
      return notFound("journal_version", input.journalId);
    }

    const revision = current.revision + 1;
    await this.dependencies.search.replaceDocuments(input.journalId, target.searchDocuments);
    const restored: MemoryJournalRecord = {
      journalId: current.journalId,
      journalDate: current.journalDate,
      timezone: current.timezone,
      title: target.title,
      content: target.content,
      contentMarkdown: target.contentMarkdown,
      contentPlainText: target.contentPlainText,
      contentHash: target.contentHash,
      projectionVersion: target.projectionVersion,
      excerpt: target.excerpt,
      tags: target.tags,
      structuredBlocks: target.structuredBlocks,
      status: "active",
      revision,
      createdAt: current.createdAt,
      updatedAt: input.restoredAt,
      deletedAt: null,
    };
    const restoredVersion: MemoryJournalVersionRecord = {
      id: parseEntityId(this.dependencies.ids.nextId()),
      journalId: input.journalId,
      revision,
      title: target.title,
      content: target.content,
      contentMarkdown: target.contentMarkdown,
      contentPlainText: target.contentPlainText,
      contentHash: target.contentHash,
      projectionVersion: target.projectionVersion,
      excerpt: target.excerpt,
      tags: target.tags,
      structuredBlocks: target.structuredBlocks,
      searchDocuments: target.searchDocuments,
      changeSource: "restore",
      createdAt: input.restoredAt,
    };

    this.journals.set(input.journalId, restored);
    this.versions.set(versionKey(input.journalId, revision), restoredVersion);

    return {
      journalId: input.journalId,
      revision,
      savedAt: input.restoredAt,
      contentHash: target.contentHash,
      versionCreated: true,
      searchIndexState: "ready",
    };
  }

  async softDelete(journalId: EntityId, expectedRevision: number): Promise<void> {
    const current = this.journals.get(journalId);
    if (current === undefined || current.deletedAt !== null) {
      return notFound("journal", journalId);
    }
    if (current.revision !== expectedRevision) {
      return conflict("journal", journalId, expectedRevision, current.revision);
    }

    const deletedAt = parseUtcTimestamp(this.dependencies.clock.nowUtc());
    await this.dependencies.search.removeEntity(journalId);
    this.journals.set(journalId, {
      ...current,
      status: "archived",
      revision: current.revision + 1,
      updatedAt: deletedAt,
      deletedAt,
    });
  }

  private assertExpectedRevision(
    journalId: EntityId,
    current: MemoryJournalRecord | undefined,
    expectedRevision: number | null,
  ): void {
    if (expectedRevision === null) {
      if (current !== undefined) {
        throw new PortError("CONFLICT", {
          message: "Journal already exists",
          entity: "journal",
          id: journalId,
          actualRevision: current.revision,
        });
      }
      return;
    }
    if (current === undefined || current.deletedAt !== null) {
      return notFound("journal", journalId);
    }
    if (current.revision !== expectedRevision) {
      return conflict("journal", journalId, expectedRevision, current.revision);
    }
  }

  private createVersionRecord(
    input: SaveJournalSnapshot,
    record: MemoryJournalRecord,
    revision: number,
    changeSource: ChangeSource,
  ): MemoryJournalVersionRecord {
    return {
      id: parseEntityId(this.dependencies.ids.nextId()),
      journalId: input.journalId,
      revision,
      title: record.title,
      content: record.content,
      contentMarkdown: record.contentMarkdown,
      contentPlainText: record.contentPlainText,
      contentHash: record.contentHash,
      projectionVersion: record.projectionVersion,
      excerpt: record.excerpt,
      tags: record.tags,
      structuredBlocks: record.structuredBlocks,
      searchDocuments: input.searchDocuments,
      changeSource,
      createdAt: input.savedAt,
    };
  }
}

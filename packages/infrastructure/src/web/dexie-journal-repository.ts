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
import { stableStringify } from "@dailyflow/shared";
import {
  createContentDocument,
  createTagName,
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
  type JournalVersion,
  type JsonObject,
  type LocalDate,
  type UtcTimestamp,
} from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "../memory/pagination-cursor.js";
import type { DailyFlowDb } from "./db.js";
import {
  replaceSearchDocumentsInTransaction,
  removeSearchDocumentsInTransaction,
  type DexieSearchIndexWriter,
} from "./dexie-search-port.js";
import type { JournalRow, JournalVersionRow, StructuredBlockRow, TagRow } from "./schema.js";

interface JournalCursor {
  readonly journalDate: string;
  readonly id: string;
}

interface VersionCursor {
  readonly revision: number;
}

export interface DexieJournalRepositoryOptions {
  readonly database: DailyFlowDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly search: DexieSearchIndexWriter;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
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

function toJournalRow(
  input: SaveJournalSnapshot,
  current: JournalRow | undefined,
  revision: number,
): JournalRow {
  return {
    id: input.journalId,
    journalDate: input.journalDate,
    timezone: input.timezone,
    title: input.title,
    contentJson: stableStringify(input.contentJson),
    editorSchemaVersion: input.editorSchemaVersion,
    contentMarkdown: input.contentMarkdown,
    contentPlainText: input.contentPlainText,
    contentHash: input.contentHash,
    projectionVersion: input.projectionVersion,
    excerpt: input.excerpt,
    status: "active",
    revision,
    createdAt: current?.createdAt ?? input.savedAt,
    updatedAt: input.savedAt,
    deletedAt: null,
  };
}

function toStructuredBlockRows(
  journalId: EntityId,
  blocks: readonly StructuredBlockProjection[],
  savedAt: UtcTimestamp,
): StructuredBlockRow[] {
  return blocks.map((block) => ({
    id: block.id,
    journalId,
    blockType: block.blockType,
    schemaVersion: block.schemaVersion,
    dataJson: stableStringify(block.data),
    orderKey: block.orderKey,
    renderedText: block.renderedText,
    createdAt: savedAt,
    updatedAt: savedAt,
    deletedAt: null,
  }));
}

function toContentDocument(contentJson: string, editorSchemaVersion: number): ContentDocument {
  return createContentDocument(editorSchemaVersion, parseJson<JsonObject>(contentJson));
}

function toJournalVersion(row: JournalVersionRow): JournalVersion {
  return {
    id: row.id,
    journalId: row.journalId,
    revision: parseRevision(row.revision),
    title: row.title,
    content: toContentDocument(row.contentJson, row.editorSchemaVersion),
    contentHash: row.contentHash,
    projectionVersion: row.projectionVersion,
    changeSource: row.changeSource,
    createdAt: row.createdAt,
  };
}

function compareJournalRows(left: JournalRow, right: JournalRow): number {
  if (left.journalDate !== right.journalDate) {
    return left.journalDate < right.journalDate ? 1 : -1;
  }

  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function isJournalAfterCursor(record: JournalRow, cursor: JournalCursor): boolean {
  if (record.journalDate !== cursor.journalDate) {
    return record.journalDate < cursor.journalDate;
  }

  return record.id < cursor.id;
}

function toJournalSummary(row: JournalRow): JournalSummary {
  return {
    id: row.id,
    journalDate: row.journalDate,
    title: row.title,
    excerpt: row.excerpt,
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}

function toVersionSummary(row: JournalVersionRow): JournalVersionSummary {
  return {
    journalId: row.journalId,
    revision: row.revision,
    title: row.title,
    changeSource: row.changeSource,
    createdAt: row.createdAt,
  };
}

function toJournalBase(row: JournalRow): Omit<Journal, "contentHash"> & {
  readonly contentHash: ContentHash;
} {
  return {
    id: row.id,
    journalDate: row.journalDate,
    timezone: row.timezone,
    title: row.title,
    content: toContentDocument(row.contentJson, row.editorSchemaVersion),
    contentMarkdown: row.contentMarkdown,
    contentPlainText: row.contentPlainText,
    contentHash: row.contentHash,
    projectionVersion: row.projectionVersion,
    excerpt: row.excerpt,
    status: row.status,
    revision: parseRevision(row.revision),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

async function replaceStructuredBlocks(
  database: DailyFlowDb,
  journalId: EntityId,
  blocks: readonly StructuredBlockProjection[],
  savedAt: UtcTimestamp,
): Promise<void> {
  await database.structuredBlocks.where("journalId").equals(journalId).delete();
  const rows = toStructuredBlockRows(journalId, blocks, savedAt);
  if (rows.length > 0) {
    await database.structuredBlocks.bulkPut(rows);
  }
}

async function replaceTags(
  database: DailyFlowDb,
  journalId: EntityId,
  tags: readonly string[],
  savedAt: UtcTimestamp,
  ids: IdGenerator,
): Promise<void> {
  await database.journalTags.where("journalId").equals(journalId).delete();
  const normalizedNames = new Set<string>();
  const tagIds: EntityId[] = [];

  for (const name of tags) {
    const parsed = createTagName(name);
    if (normalizedNames.has(parsed.normalized)) {
      continue;
    }
    normalizedNames.add(parsed.normalized);

    const existing = await database.tags.where("nameNormalized").equals(parsed.normalized).first();
    const tag: TagRow = existing ?? {
      id: parseEntityId(ids.nextId()),
      name: parsed.value,
      nameNormalized: parsed.normalized,
      color: null,
      createdAt: savedAt,
      updatedAt: savedAt,
    };
    if (existing === undefined) {
      await database.tags.put(tag);
    }
    tagIds.push(tag.id);
  }

  if (tagIds.length > 0) {
    await database.journalTags.bulkPut(
      tagIds.map((tagId) => ({
        journalId,
        tagId,
      })),
    );
  }
}

async function readJournalTags(database: DailyFlowDb, journalId: EntityId): Promise<string[]> {
  const links = await database.journalTags.where("journalId").equals(journalId).toArray();
  const rows = await database.tags.bulkGet(links.map((link) => link.tagId));
  return rows.flatMap((row) => (row === undefined ? [] : [row.name]));
}

async function toJournal(database: DailyFlowDb, row: JournalRow): Promise<Journal> {
  return {
    ...toJournalBase(row),
    contentHash: row.contentHash,
  };
}

function createVersionRow(
  input: SaveJournalSnapshot,
  revision: number,
  id: EntityId,
  changeSource: ChangeSource,
): JournalVersionRow {
  return {
    id,
    journalId: input.journalId,
    revision,
    title: input.title,
    contentJson: stableStringify(input.contentJson),
    editorSchemaVersion: input.editorSchemaVersion,
    contentMarkdown: input.contentMarkdown,
    contentPlainText: input.contentPlainText,
    contentHash: input.contentHash,
    projectionVersion: input.projectionVersion,
    excerpt: input.excerpt,
    tagsJson: stableStringify(input.tags),
    structuredBlocksJson: stableStringify(input.structuredBlocks),
    searchDocumentsJson: stableStringify(input.searchDocuments),
    changeSource,
    createdAt: input.savedAt,
  };
}

function assertExpectedJournalRevision(
  journalId: EntityId,
  current: JournalRow | undefined,
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

export async function saveJournalSnapshotInTransaction(
  database: DailyFlowDb,
  input: SaveJournalSnapshot,
  ids: IdGenerator,
): Promise<SavedJournalSnapshot> {
  const current = await database.journals.get(input.journalId);
  assertExpectedJournalRevision(input.journalId, current, input.expectedRevision);

  const conflictingDate = (
    await database.journals.where("journalDate").equals(input.journalDate).toArray()
  ).find((row) => row.deletedAt === null && row.id !== input.journalId);
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
  await database.journals.put(toJournalRow(input, current, revision));
  await replaceStructuredBlocks(
    database,
    input.journalId,
    input.structuredBlocks,
    input.savedAt,
  );
  await replaceTags(database, input.journalId, input.tags, input.savedAt, ids);
  await replaceSearchDocumentsInTransaction(
    database,
    input.journalId,
    input.searchDocuments,
  );

  if (versionCreated) {
    await database.journalVersions.put(
      createVersionRow(input, revision, parseEntityId(ids.nextId()), input.checkpoint),
    );
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

export class DexieJournalRepository implements JournalRepository {
  private readonly database: DailyFlowDb;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly search: DexieSearchIndexWriter;

  constructor(options: DexieJournalRepositoryOptions) {
    this.database = options.database;
    this.ids = options.ids;
    this.clock = options.clock;
    this.search = options.search;
  }

  async getByDate(date: LocalDate): Promise<Journal | null> {
    const row = await this.database.journals
      .where("journalDate")
      .equals(date)
      .filter((candidate) => candidate.deletedAt === null && candidate.status === "active")
      .first();
    return row === undefined ? null : toJournal(this.database, row);
  }

  async getById(id: EntityId): Promise<Journal | null> {
    const row = await this.database.journals.get(id);
    return row === undefined || row.deletedAt !== null || row.status !== "active"
      ? null
      : toJournal(this.database, row);
  }

  async getSaveState(journalId: EntityId): Promise<JournalSaveState | null> {
    const row = await this.database.journals.get(journalId);
    if (row === undefined || row.deletedAt !== null || row.status !== "active") {
      return null;
    }

    return {
      journalId: row.id,
      journalDate: row.journalDate,
      timezone: row.timezone,
      revision: row.revision,
      title: row.title,
      contentHash: row.contentHash,
      projectionVersion: row.projectionVersion,
      tags: await readJournalTags(this.database, journalId),
      updatedAt: row.updatedAt,
    };
  }

  async listSummaries(query: JournalListQuery): Promise<Page<JournalSummary>> {
    const limit = resolvePageSize(query.limit);
    const cursor = query.cursor === undefined ? null : decodeCursor<JournalCursor>(query.cursor);
    const status = query.status ?? "active";
    const records = (await this.database.journals.toArray())
      .filter((row) => row.deletedAt === null && row.status === status)
      .filter((row) => query.fromDate === undefined || row.journalDate >= query.fromDate)
      .filter((row) => query.toDate === undefined || row.journalDate <= query.toDate)
      .filter((row) => cursor === null || isJournalAfterCursor(row, cursor))
      .sort(compareJournalRows);

    const page = records.slice(0, limit + 1);
    const items = page.slice(0, limit);
    const last = items.at(-1);

    return {
      items: items.map(toJournalSummary),
      nextCursor:
        page.length > limit && last !== undefined
          ? encodeCursor({ journalDate: last.journalDate, id: last.id })
          : null,
    };
  }

  async saveSnapshot(input: SaveJournalSnapshot): Promise<SavedJournalSnapshot> {
    return this.database.transaction(
      "rw",
      [
        this.database.journals,
        this.database.journalVersions,
        this.database.structuredBlocks,
        this.database.journalTags,
        this.database.tags,
        this.database.searchDocs,
        this.database.searchTermPostings,
      ],
      async () => saveJournalSnapshotInTransaction(this.database, input, this.ids),
    );
  }

  async listVersions(journalId: EntityId, page: PageRequest): Promise<Page<JournalVersionSummary>> {
    const limit = resolvePageSize(page.limit);
    const cursor = page.cursor === undefined ? null : decodeCursor<VersionCursor>(page.cursor);
    const rows = (
      await this.database.journalVersions.where("journalId").equals(journalId).toArray()
    )
      .filter((row) => cursor === null || row.revision < cursor.revision)
      .sort((left, right) => right.revision - left.revision);
    const selected = rows.slice(0, limit + 1);
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
    const row = await this.database.journalVersions
      .where("[journalId+revision]")
      .equals([journalId, revision])
      .first();
    return row === undefined ? null : toJournalVersion(row);
  }

  async restoreVersion(input: RestoreJournalVersionInput): Promise<SavedJournalSnapshot> {
    return this.database.transaction(
      "rw",
      [
        this.database.journals,
        this.database.journalVersions,
        this.database.structuredBlocks,
        this.database.journalTags,
        this.database.tags,
        this.database.searchDocs,
        this.database.searchTermPostings,
      ],
      async () => {
        const current = await this.database.journals.get(input.journalId);
        if (current === undefined || current.deletedAt !== null) {
          return notFound("journal", input.journalId);
        }
        if (current.revision !== input.expectedCurrentRevision) {
          return conflict(
            "journal",
            input.journalId,
            input.expectedCurrentRevision,
            current.revision,
          );
        }

        const target = await this.database.journalVersions
          .where("[journalId+revision]")
          .equals([input.journalId, input.versionRevision])
          .first();
        if (target === undefined) {
          return notFound("journal_version", input.journalId);
        }

        const tags = parseJson<string[]>(target.tagsJson);
        const structuredBlocks = parseJson<StructuredBlockProjection[]>(
          target.structuredBlocksJson,
        );
        const searchDocuments = parseJson<SearchDocument[]>(target.searchDocumentsJson);
        const revision = current.revision + 1;
        const restored: JournalRow = {
          id: current.id,
          journalDate: current.journalDate,
          timezone: current.timezone,
          title: target.title,
          contentJson: target.contentJson,
          editorSchemaVersion: target.editorSchemaVersion,
          contentMarkdown: target.contentMarkdown,
          contentPlainText: target.contentPlainText,
          contentHash: target.contentHash,
          projectionVersion: target.projectionVersion,
          excerpt: target.excerpt,
          status: "active",
          revision,
          createdAt: current.createdAt,
          updatedAt: input.restoredAt,
          deletedAt: null,
        };
        const restoredVersion: JournalVersionRow = {
          ...target,
          id: parseEntityId(this.ids.nextId()),
          revision,
          changeSource: "restore",
          createdAt: input.restoredAt,
        };

        await this.database.journals.put(restored);
        await replaceStructuredBlocks(
          this.database,
          input.journalId,
          structuredBlocks,
          input.restoredAt,
        );
        await replaceTags(this.database, input.journalId, tags, input.restoredAt, this.ids);
        await replaceSearchDocumentsInTransaction(this.database, input.journalId, searchDocuments);
        await this.database.journalVersions.put(restoredVersion);

        return {
          journalId: input.journalId,
          revision,
          savedAt: input.restoredAt,
          contentHash: target.contentHash,
          versionCreated: true,
          searchIndexState: "ready",
        };
      },
    );
  }

  async softDelete(journalId: EntityId, expectedRevision: number): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.journals, this.database.searchDocs, this.database.searchTermPostings],
      async () => {
        const current = await this.database.journals.get(journalId);
        if (current === undefined || current.deletedAt !== null) {
          return notFound("journal", journalId);
        }
        if (current.revision !== expectedRevision) {
          return conflict("journal", journalId, expectedRevision, current.revision);
        }

        const deletedAt = parseUtcTimestamp(this.clock.nowUtc());
        await this.database.journals.put({
          ...current,
          status: "archived",
          revision: current.revision + 1,
          updatedAt: deletedAt,
          deletedAt,
        });
        await removeSearchDocumentsInTransaction(this.database, journalId);
      },
    );
  }

}

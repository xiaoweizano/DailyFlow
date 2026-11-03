import type {
  SearchDocument,
  SearchEntityType,
  SearchHit,
  SearchPort,
  SearchQuery,
  SearchRebuildOptions,
  SearchRebuildResult,
  SearchResultPage,
} from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import { jsonToPlainText, type TiptapJsonNode } from "@dailyflow/editor";
import { createSearchBigrams, normalizeSearchText } from "@dailyflow/shared";
import {
  parseContentHash,
  parseLocalDate,
  parseUtcTimestamp,
  type Clock,
  type EntityId,
} from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "../memory/pagination-cursor.js";
import type { DailyFlowDb } from "./db.js";
import type {
  JournalRow,
  JournalTagRow,
  KnowledgeItemRow,
  KnowledgeTagRow,
  SearchDocumentRow,
  SearchPostingField,
  SearchTermPostingRow,
  StructuredBlockRow,
  TagRow,
  TaskRow,
} from "./schema.js";

export interface DexieSearchIndexWriter {
  replaceDocuments(ownerEntityId: EntityId, documents: readonly SearchDocument[]): Promise<void>;
  removeEntity(ownerEntityId: EntityId): Promise<void>;
}

interface SearchCursor {
  readonly score: number;
  readonly updatedAt: string;
  readonly id: string;
}

interface RankedDocument {
  readonly document: SearchDocumentRow;
  readonly score: number;
}

const NON_SEARCH_CHARACTER_PATTERN = /[^\p{L}\p{N}]+/gu;
const TOKEN_SEPARATOR_PATTERN = /[_\-.+#/:'\u2019]+/gu;

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_SEARCH_CHARACTER_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenizeForPosting(value: string): string[] {
  const normalized = normalizeSearchText(value);
  const tokens = new Set<string>();

  for (const segment of normalized.split(" ")) {
    if (segment.length === 0) {
      continue;
    }

    tokens.add(segment);
    for (const part of segment.split(TOKEN_SEPARATOR_PATTERN)) {
      if (part.length > 0) {
        tokens.add(part);
      }
    }
  }

  for (const bigram of createSearchBigrams(normalized)) {
    tokens.add(bigram);
  }

  return [...tokens];
}

function collectPostings(document: SearchDocumentRow): SearchTermPostingRow[] {
  const frequencies = new Map<
    string,
    {
      readonly term: string;
      readonly field: SearchPostingField;
      frequency: number;
    }
  >();

  const addField = (field: SearchPostingField, value: string): void => {
    for (const term of tokenizeForPosting(value)) {
      const key = `${field}:${term}`;
      const current = frequencies.get(key);
      if (current === undefined) {
        frequencies.set(key, { term, field, frequency: 1 });
      } else {
        current.frequency += 1;
      }
    }
  };

  addField("title", document.title);
  addField("body", `${document.normalizedText} ${document.bodyText}`);
  addField("structured", document.structuredText);
  addField("tag", document.tagsText);

  return [...frequencies.values()].map(({ term, field, frequency }) => ({
    id: `${term}:${document.id}:${field}`,
    term,
    docId: document.id,
    frequency,
    field,
  }));
}

const EMPTY_CONTENT_HASH = parseContentHash("0".repeat(64));

interface AuthoritativeSearchSnapshot {
  readonly documents: readonly SearchDocument[];
  readonly ownerEntityIdById: ReadonlyMap<EntityId, EntityId>;
  readonly totalCount: number;
}

interface SearchAuthorityRows {
  readonly journals: readonly JournalRow[];
  readonly structuredBlocks: readonly StructuredBlockRow[];
  readonly knowledgeItems: readonly KnowledgeItemRow[];
  readonly tasks: readonly TaskRow[];
  readonly tags: readonly TagRow[];
  readonly journalTags: readonly JournalTagRow[];
  readonly knowledgeTags: readonly KnowledgeTagRow[];
}

function tagNames(
  tags: SearchAuthorityRows["tags"],
  links: readonly { readonly tagId: EntityId }[],
): string {
  const linksByTag = new Map(tags.map((tag) => [tag.id, tag.name] as const));
  return links
    .map((link) => linksByTag.get(link.tagId))
    .filter((name): name is string => name !== undefined)
    .sort()
    .join(" ");
}

function createAuthoritativeDocuments(
  rows: SearchAuthorityRows,
  scope?: readonly SearchEntityType[],
): SearchDocument[] {
  const selectedTypes = scope === undefined ? null : new Set(scope);
  const shouldInclude = (entityType: SearchEntityType): boolean =>
    selectedTypes === null || selectedTypes.has(entityType);
  const activeJournals = rows.journals.filter(
    (journal) => journal.deletedAt === null && journal.status === "active",
  );
  const journalById = new Map(activeJournals.map((journal) => [journal.id, journal] as const));
  const journalTagsById = new Map<EntityId, JournalTagRow[]>();
  const knowledgeTagsById = new Map<EntityId, KnowledgeTagRow[]>();

  for (const link of rows.journalTags) {
    const links = journalTagsById.get(link.journalId) ?? [];
    links.push(link);
    journalTagsById.set(link.journalId, links);
  }
  for (const link of rows.knowledgeTags) {
    const links = knowledgeTagsById.get(link.knowledgeItemId) ?? [];
    links.push(link);
    knowledgeTagsById.set(link.knowledgeItemId, links);
  }

  const documents: SearchDocument[] = [];

  if (shouldInclude("journal")) {
    for (const journal of activeJournals) {
      const tagsText = tagNames(rows.tags, journalTagsById.get(journal.id) ?? []);
      const normalizedText = normalizeSearchText(
        `${journal.title} ${journal.contentPlainText} ${tagsText}`,
      );
      documents.push({
        id: journal.id,
        entityType: "journal",
        entityId: journal.id,
        title: journal.title,
        bodyText: journal.contentPlainText,
        structuredText: "",
        tagsText,
        normalizedText,
        tokenizedText: normalizedText,
        localDate: journal.journalDate,
        updatedAt: journal.updatedAt,
        contentHash: journal.contentHash,
        indexVersion: 1,
      });
    }
  }

  if (shouldInclude("knowledge_item")) {
    for (const item of rows.knowledgeItems) {
      if (item.deletedAt !== null || item.status !== "active") {
        continue;
      }
      const bodyText = jsonToPlainText(JSON.parse(item.contentJson) as TiptapJsonNode);
      const tagsText = tagNames(rows.tags, knowledgeTagsById.get(item.id) ?? []);
      const normalizedText = normalizeSearchText(`${item.title} ${bodyText} ${tagsText}`);
      documents.push({
        id: item.id,
        entityType: "knowledge_item",
        entityId: item.id,
        title: item.title,
        bodyText,
        structuredText: "",
        tagsText,
        normalizedText,
        tokenizedText: normalizedText,
        localDate: parseLocalDate(item.updatedAt.slice(0, 10)),
        updatedAt: item.updatedAt,
        contentHash: item.contentHash ?? EMPTY_CONTENT_HASH,
        indexVersion: 1,
      });
    }
  }

  if (shouldInclude("task")) {
    for (const task of rows.tasks) {
      if (task.deletedAt !== null) {
        continue;
      }
      const normalizedText = normalizeSearchText(`${task.title} ${task.descriptionText}`);
      documents.push({
        id: task.id,
        entityType: "task",
        entityId: task.id,
        title: task.title,
        bodyText: task.descriptionText,
        structuredText: "",
        tagsText: "",
        normalizedText,
        tokenizedText: normalizedText,
        localDate: task.dueDate,
        updatedAt: task.updatedAt,
        contentHash: EMPTY_CONTENT_HASH,
        indexVersion: 1,
      });
    }
  }

  if (shouldInclude("structured_block")) {
    for (const block of rows.structuredBlocks) {
      const journal = journalById.get(block.journalId);
      if (block.deletedAt !== null || journal === undefined) {
        continue;
      }
      const normalizedText = normalizeSearchText(
        `${journal.title} ${block.blockType} ${block.renderedText}`,
      );
      documents.push({
        id: block.id,
        entityType: "structured_block",
        entityId: block.id,
        title: `${journal.title} · ${block.blockType}`,
        bodyText: block.renderedText,
        structuredText: block.renderedText,
        tagsText: "",
        normalizedText,
        tokenizedText: normalizedText,
        localDate: journal.journalDate,
        updatedAt: block.updatedAt,
        contentHash: EMPTY_CONTENT_HASH,
        indexVersion: 1,
      });
    }
  }

  return documents.sort((left, right) => left.id.localeCompare(right.id));
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new DOMException("Search rebuild cancelled", "AbortError");
  }
}

function toSearchDocumentRow(ownerEntityId: EntityId, document: SearchDocument): SearchDocumentRow {
  return {
    id: document.id,
    ownerEntityId,
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
  };
}

function assertUniqueDocuments(documents: readonly SearchDocument[]): void {
  const ids = new Set<EntityId>();
  for (const document of documents) {
    if (ids.has(document.id)) {
      throw new PortError("CONFLICT", {
        message: `Duplicate search document: ${document.id}`,
        entity: "search_document",
        id: document.id,
      });
    }
    ids.add(document.id);
  }
}

export async function replaceSearchDocumentsInTransaction(
  database: DailyFlowDb,
  ownerEntityId: EntityId,
  documents: readonly SearchDocument[],
): Promise<void> {
  assertUniqueDocuments(documents);

  const documentIds = documents.map((document) => document.id);
  const existing = await database.searchDocs.bulkGet(documentIds);
  for (const row of existing) {
    if (row !== undefined && row.ownerEntityId !== ownerEntityId) {
      throw new PortError("CONFLICT", {
        message: `Search document belongs to another entity: ${row.id}`,
        entity: "search_document",
        id: row.id,
      });
    }
  }

  const oldRows = await database.searchDocs.where("ownerEntityId").equals(ownerEntityId).toArray();
  const oldDocumentIds = oldRows.map((row) => row.id);
  if (oldDocumentIds.length > 0) {
    await database.searchTermPostings.where("docId").anyOf(oldDocumentIds).delete();
  }
  await database.searchDocs.where("ownerEntityId").equals(ownerEntityId).delete();

  const rows = documents.map((document) => toSearchDocumentRow(ownerEntityId, document));
  const postings = rows.flatMap(collectPostings);
  await database.searchDocs.bulkPut(rows);
  if (postings.length > 0) {
    await database.searchTermPostings.bulkPut(postings);
  }
}

export async function removeSearchDocumentsInTransaction(
  database: DailyFlowDb,
  ownerEntityId: EntityId,
): Promise<void> {
  const rows = await database.searchDocs.where("ownerEntityId").equals(ownerEntityId).toArray();
  const documentIds = rows.map((row) => row.id);
  if (documentIds.length > 0) {
    await database.searchTermPostings.where("docId").anyOf(documentIds).delete();
  }
  await database.searchDocs.where("ownerEntityId").equals(ownerEntityId).delete();
}

function containsEveryTerm(value: string, terms: readonly string[]): boolean {
  return terms.every((term) => value.includes(term));
}

function scoreDocument(
  document: SearchDocumentRow,
  query: string,
  terms: readonly string[],
): number {
  const title = normalizeForMatch(document.title);
  const body = normalizeForMatch(document.bodyText);
  const structured = normalizeForMatch(document.structuredText);
  const tags = normalizeForMatch(document.tagsText);
  const normalized = normalizeForMatch(document.normalizedText);
  const searchable = `${normalized} ${structured} ${tags}`.trim();

  if (!containsEveryTerm(searchable, terms)) {
    return 0;
  }

  let score = terms.length;
  if (title === query) {
    score += 1_000;
  } else if (title.includes(query)) {
    score += 500;
  } else if (containsEveryTerm(title, terms)) {
    score += 300;
  }

  if (body.includes(query)) {
    score += 100;
  } else if (containsEveryTerm(body, terms)) {
    score += 50;
  }
  if (structured.includes(query)) {
    score += 25;
  }
  if (tags.includes(query)) {
    score += 15;
  }

  return score;
}

function createSnippet(document: SearchDocumentRow): string {
  const text = document.bodyText.trim() || document.title.trim();
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}

function compareRankedDocuments(left: RankedDocument, right: RankedDocument): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.document.updatedAt !== right.document.updatedAt) {
    return left.document.updatedAt < right.document.updatedAt ? 1 : -1;
  }

  return left.document.id < right.document.id ? 1 : left.document.id > right.document.id ? -1 : 0;
}

function isAfterCursor(item: RankedDocument, cursor: SearchCursor): boolean {
  if (item.score !== cursor.score) {
    return item.score < cursor.score;
  }
  if (item.document.updatedAt !== cursor.updatedAt) {
    return item.document.updatedAt < cursor.updatedAt;
  }

  return item.document.id < cursor.id;
}

function toSearchHit(item: RankedDocument): SearchHit {
  return {
    entityType: item.document.entityType,
    entityId: item.document.entityId,
    title: item.document.title,
    snippet: createSnippet(item.document),
    localDate: item.document.localDate,
    score: item.score,
  };
}

export class DexieSearchPort implements SearchPort, DexieSearchIndexWriter {
  constructor(
    private readonly dependencies: {
      readonly database: DailyFlowDb;
      readonly clock: Clock;
    },
  ) {}

  async replaceDocuments(
    ownerEntityId: EntityId,
    documents: readonly SearchDocument[],
  ): Promise<void> {
    await this.dependencies.database.transaction(
      "rw",
      [this.dependencies.database.searchDocs, this.dependencies.database.searchTermPostings],
      async () =>
        replaceSearchDocumentsInTransaction(this.dependencies.database, ownerEntityId, documents),
    );
  }

  async removeEntity(ownerEntityId: EntityId): Promise<void> {
    await this.dependencies.database.transaction(
      "rw",
      [this.dependencies.database.searchDocs, this.dependencies.database.searchTermPostings],
      async () => removeSearchDocumentsInTransaction(this.dependencies.database, ownerEntityId),
    );
  }

  async query(input: SearchQuery): Promise<SearchResultPage> {
    const limit = resolvePageSize(input.limit);
    const query = normalizeForMatch(input.text);
    const indexState = await this.getIndexState();
    if (query.length === 0) {
      return { items: [], nextCursor: null, indexState };
    }

    const terms = query.split(" ");
    const entityTypes = input.entityTypes === undefined ? null : new Set(input.entityTypes);
    const cursor = input.cursor === undefined ? null : decodeCursor<SearchCursor>(input.cursor);
    const ranked = (await this.dependencies.database.searchDocs.toArray())
      .map((document) => ({
        document,
        score: scoreDocument(document, query, terms),
      }))
      .filter((item) => item.score > 0)
      .filter(({ document }) => entityTypes === null || entityTypes.has(document.entityType))
      .filter(
        ({ document }) =>
          input.fromDate === undefined ||
          (document.localDate !== null && document.localDate >= input.fromDate),
      )
      .filter(
        ({ document }) =>
          input.toDate === undefined ||
          (document.localDate !== null && document.localDate <= input.toDate),
      )
      .filter((item) => cursor === null || isAfterCursor(item, cursor))
      .sort(compareRankedDocuments);

    const page = ranked.slice(0, limit + 1);
    const items = page.slice(0, limit);
    const last = items.at(-1);
    const nextCursor =
      page.length > limit && last !== undefined
        ? encodeCursor({
            score: last.score,
            updatedAt: last.document.updatedAt,
            id: last.document.id,
          })
        : null;

    return {
      items: items.map(toSearchHit),
      nextCursor,
      indexState,
    };
  }

  async rebuild(
    scope?: readonly SearchEntityType[],
    options: SearchRebuildOptions = {},
  ): Promise<SearchRebuildResult> {
    const completedAt = parseUtcTimestamp(this.dependencies.clock.nowUtc());
    if (options.signal?.aborted === true) {
      return { indexedCount: 0, completedAt, status: "cancelled" };
    }

    const snapshot = await this.readAuthoritativeSnapshot(scope, options);
    try {
      throwIfCancelled(options.signal);
    } catch {
      return { indexedCount: 0, completedAt, status: "cancelled" };
    }

    const rows = snapshot.documents.map((document) =>
      toSearchDocumentRow(
        snapshot.ownerEntityIdById.get(document.id) ?? document.entityId,
        document,
      ),
    );
    const postings = rows.flatMap(collectPostings);

    options.onProgress?.({
      phase: "indexing",
      processedCount: 0,
      totalCount: snapshot.totalCount,
    });
    for (let index = 0; index < rows.length; index += 1) {
      try {
        throwIfCancelled(options.signal);
      } catch {
        return { indexedCount: 0, completedAt, status: "cancelled" };
      }
      options.onProgress?.({
        phase: "indexing",
        processedCount: index + 1,
        totalCount: snapshot.totalCount,
      });
    }

    options.onProgress?.({
      phase: "committing",
      processedCount: snapshot.totalCount,
      totalCount: snapshot.totalCount,
    });

    let cancelled = false;
    await this.dependencies.database.transaction(
      "rw",
      [
        this.dependencies.database.searchDocs,
        this.dependencies.database.searchTermPostings,
        this.dependencies.database.meta,
      ],
      async () => {
        if (options.signal?.aborted === true) {
          cancelled = true;
          return;
        }
        const selectedTypes = scope === undefined ? null : new Set(scope);
        const oldRows = (await this.dependencies.database.searchDocs.toArray()).filter(
          (document) => selectedTypes === null || selectedTypes.has(document.entityType),
        );
        const oldDocumentIds = oldRows.map((document) => document.id);
        if (oldDocumentIds.length > 0) {
          await this.dependencies.database.searchTermPostings
            .where("docId")
            .anyOf(oldDocumentIds)
            .delete();
        }
        await this.dependencies.database.searchDocs.bulkDelete(oldDocumentIds);
        if (rows.length > 0) {
          await this.dependencies.database.searchDocs.bulkPut(rows);
        }
        if (postings.length > 0) {
          await this.dependencies.database.searchTermPostings.bulkPut(postings);
        }
        await this.dependencies.database.meta.put({
          key: "searchIndexState",
          value: "ready",
          updatedAt: completedAt,
        });
      },
    );

    return {
      indexedCount: cancelled ? 0 : snapshot.documents.length,
      completedAt,
      status: cancelled ? "cancelled" : "completed",
    };
  }

  private async readAuthoritativeSnapshot(
    scope: readonly SearchEntityType[] | undefined,
    options: SearchRebuildOptions,
  ): Promise<AuthoritativeSearchSnapshot> {
    const database = this.dependencies.database;
    const rows = await database.transaction(
      "r",
      [
        database.journals,
        database.structuredBlocks,
        database.knowledgeItems,
        database.tasks,
        database.tags,
        database.journalTags,
        database.knowledgeTags,
      ],
      async (): Promise<SearchAuthorityRows> => ({
        journals: await database.journals.toArray(),
        structuredBlocks: await database.structuredBlocks.toArray(),
        knowledgeItems: await database.knowledgeItems.toArray(),
        tasks: await database.tasks.toArray(),
        tags: await database.tags.toArray(),
        journalTags: await database.journalTags.toArray(),
        knowledgeTags: await database.knowledgeTags.toArray(),
      }),
    );
    const documents = createAuthoritativeDocuments(rows, scope);
    const ownerEntityIdById = new Map<EntityId, EntityId>(
      rows.structuredBlocks.map((block) => [block.id, block.journalId] as const),
    );
    options.onProgress?.({
      phase: "reading",
      processedCount: documents.length,
      totalCount: documents.length,
    });
    return { documents, ownerEntityIdById, totalCount: documents.length };
  }

  private async getIndexState(): Promise<SearchResultPage["indexState"]> {
    const state = await this.dependencies.database.meta.get("searchIndexState");
    return state?.value === "stale" || state?.value === "failed" ? state.value : "ready";
  }
}

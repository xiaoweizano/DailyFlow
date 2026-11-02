import type {
  SearchDocument,
  SearchEntityType,
  SearchHit,
  SearchPort,
  SearchQuery,
  SearchRebuildResult,
  SearchResultPage,
} from "@dailyflow/application";
import { PortError } from "@dailyflow/application";
import { createSearchBigrams, normalizeSearchText } from "@dailyflow/shared";
import { parseUtcTimestamp, type Clock, type EntityId } from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "../memory/pagination-cursor.js";
import type { DailyFlowDb } from "./db.js";
import type { SearchDocumentRow, SearchPostingField, SearchTermPostingRow } from "./schema.js";

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

  async rebuild(scope?: readonly SearchEntityType[]): Promise<SearchRebuildResult> {
    const completedAt = parseUtcTimestamp(this.dependencies.clock.nowUtc());
    const indexedCount = await this.dependencies.database.transaction(
      "rw",
      [
        this.dependencies.database.searchDocs,
        this.dependencies.database.searchTermPostings,
        this.dependencies.database.meta,
      ],
      async () => {
        const selected =
          scope === undefined
            ? await this.dependencies.database.searchDocs.toArray()
            : (await this.dependencies.database.searchDocs.toArray()).filter((document) =>
                scope.includes(document.entityType),
              );
        const documentIds = selected.map((document) => document.id);
        if (documentIds.length > 0) {
          await this.dependencies.database.searchTermPostings
            .where("docId")
            .anyOf(documentIds)
            .delete();
        }
        const postings = selected.flatMap(collectPostings);
        if (postings.length > 0) {
          await this.dependencies.database.searchTermPostings.bulkPut(postings);
        }
        await this.dependencies.database.meta.put({
          key: "searchIndexState",
          value: "ready",
          updatedAt: completedAt,
        });

        return selected.length;
      },
    );

    return { indexedCount, completedAt };
  }

  private async getIndexState(): Promise<SearchResultPage["indexState"]> {
    const state = await this.dependencies.database.meta.get("searchIndexState");
    return state?.value === "stale" || state?.value === "failed" ? state.value : "ready";
  }
}

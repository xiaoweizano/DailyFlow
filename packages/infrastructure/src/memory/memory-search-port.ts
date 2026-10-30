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
import { parseUtcTimestamp, type Clock, type EntityId } from "@dailyflow/domain";

import { decodeCursor, encodeCursor, resolvePageSize } from "./pagination-cursor.js";

export interface SearchIndexWriter {
  replaceDocuments(ownerEntityId: EntityId, documents: readonly SearchDocument[]): Promise<void>;
  removeEntity(ownerEntityId: EntityId): Promise<void>;
}

interface IndexedSearchDocument {
  readonly ownerEntityId: EntityId;
  readonly document: SearchDocument;
}

interface SearchCursor {
  readonly score: number;
  readonly updatedAt: string;
  readonly id: string;
}

interface RankedDocument {
  readonly document: SearchDocument;
  readonly score: number;
}

const NON_SEARCH_CHARACTER_PATTERN = /[^\p{L}\p{N}]+/gu;

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_SEARCH_CHARACTER_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function containsEveryTerm(value: string, terms: readonly string[]): boolean {
  return terms.every((term) => value.includes(term));
}

function scoreDocument(document: SearchDocument, query: string, terms: readonly string[]): number {
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

function createSnippet(document: SearchDocument): string {
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

export class MemorySearchPort implements SearchPort, SearchIndexWriter {
  private documents = new Map<EntityId, IndexedSearchDocument>();

  constructor(private readonly dependencies: { readonly clock: Clock }) {}

  async replaceDocuments(
    ownerEntityId: EntityId,
    documents: readonly SearchDocument[],
  ): Promise<void> {
    const next = new Map(this.documents);
    for (const [documentId, indexed] of next) {
      if (indexed.ownerEntityId === ownerEntityId) {
        next.delete(documentId);
      }
    }

    for (const document of documents) {
      if (next.has(document.id)) {
        throw new PortError("CONFLICT", {
          message: `Duplicate search document: ${document.id}`,
          entity: "search_document",
          id: document.id,
        });
      }
      next.set(document.id, { ownerEntityId, document });
    }

    this.documents = next;
  }

  async removeEntity(ownerEntityId: EntityId): Promise<void> {
    const next = new Map(this.documents);
    for (const [documentId, indexed] of next) {
      if (indexed.ownerEntityId === ownerEntityId) {
        next.delete(documentId);
      }
    }
    this.documents = next;
  }

  async query(input: SearchQuery): Promise<SearchResultPage> {
    const limit = resolvePageSize(input.limit);
    const query = normalizeForMatch(input.text);
    if (query.length === 0) {
      return { items: [], nextCursor: null, indexState: "ready" };
    }

    const terms = query.split(" ");
    const entityTypes = input.entityTypes === undefined ? null : new Set(input.entityTypes);
    const cursor = input.cursor === undefined ? null : decodeCursor<SearchCursor>(input.cursor);
    const ranked = [...this.documents.values()]
      .map(({ document }) => ({
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
      indexState: "ready",
    };
  }

  async rebuild(scope?: readonly SearchEntityType[]): Promise<SearchRebuildResult> {
    const selected =
      scope === undefined
        ? [...this.documents.values()]
        : [...this.documents.values()].filter(({ document }) =>
            scope.includes(document.entityType),
          );

    return {
      indexedCount: selected.length,
      completedAt: parseUtcTimestamp(this.dependencies.clock.nowUtc()),
    };
  }
}

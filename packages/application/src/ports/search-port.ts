import type { ContentHash, EntityId, LocalDate, UtcTimestamp } from "@dailyflow/domain";

export const SEARCH_ENTITY_TYPES = [
  "journal",
  "knowledge_item",
  "task",
  "structured_block",
] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export interface SearchDocument {
  readonly id: EntityId;
  readonly entityType: SearchEntityType;
  readonly entityId: EntityId;
  readonly title: string;
  readonly bodyText: string;
  readonly structuredText: string;
  readonly tagsText: string;
  readonly normalizedText: string;
  readonly tokenizedText: string;
  readonly localDate: LocalDate | null;
  readonly updatedAt: UtcTimestamp;
  readonly contentHash: ContentHash;
  readonly indexVersion: number;
}

export interface SearchQuery {
  readonly text: string;
  readonly entityTypes?: readonly SearchEntityType[];
  readonly fromDate?: LocalDate;
  readonly toDate?: LocalDate;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface SearchHit {
  readonly entityType: SearchEntityType;
  readonly entityId: EntityId;
  readonly title: string;
  readonly snippet: string;
  readonly localDate: LocalDate | null;
  readonly score: number;
}

export interface SearchResultPage {
  readonly items: readonly SearchHit[];
  readonly nextCursor: string | null;
  readonly indexState: "ready" | "stale";
}

export interface SearchRebuildResult {
  readonly indexedCount: number;
  readonly completedAt: UtcTimestamp;
}

export interface SearchPort {
  query(input: SearchQuery): Promise<SearchResultPage>;
  rebuild(scope?: readonly SearchEntityType[]): Promise<SearchRebuildResult>;
}

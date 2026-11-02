import type {
  ChangeSource,
  ContentHash,
  EntityId,
  JournalStatus,
  LocalDate,
  StructuredBlockType,
  UtcTimestamp,
} from "@dailyflow/domain";
import type { SearchEntityType } from "@dailyflow/application";

export interface MetaRow {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt?: UtcTimestamp;
}

export interface JournalRow {
  readonly id: EntityId;
  readonly journalDate: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly contentJson: string;
  readonly editorSchemaVersion: number;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly status: JournalStatus;
  readonly revision: number;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface JournalVersionRow {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly revision: number;
  readonly title: string;
  readonly contentJson: string;
  readonly editorSchemaVersion: number;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly tagsJson: string;
  readonly structuredBlocksJson: string;
  readonly searchDocumentsJson: string;
  readonly changeSource: ChangeSource;
  readonly createdAt: UtcTimestamp;
}

export interface StructuredBlockRow {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly dataJson: string;
  readonly orderKey: string;
  readonly renderedText: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface TagRow {
  readonly id: EntityId;
  readonly name: string;
  readonly nameNormalized: string;
  readonly color: string | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface JournalTagRow {
  readonly journalId: EntityId;
  readonly tagId: EntityId;
}

export interface KnowledgeTagRow {
  readonly knowledgeItemId: EntityId;
  readonly tagId: EntityId;
}

export interface SearchDocumentRow {
  readonly id: EntityId;
  readonly ownerEntityId: EntityId;
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

export type SearchPostingField = "title" | "body" | "structured" | "tag";

export interface SearchTermPostingRow {
  readonly id: string;
  readonly term: string;
  readonly docId: EntityId;
  readonly frequency: number;
  readonly field: SearchPostingField;
}

export type GenericStoreRow = Record<string, unknown>;

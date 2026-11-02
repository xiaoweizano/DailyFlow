import type {
  ContentHash,
  ContentDocument,
  EntityId,
  Journal,
  JournalVersion,
  JsonObject,
  LocalDate,
  StructuredBlockType,
  UtcTimestamp,
} from "@dailyflow/domain";

import type { Page, PageRequest } from "./pagination.js";
import type { SearchDocument } from "./search-port.js";
import type { SearchEntityType } from "./search-port.js";

export type JournalSaveCheckpoint = "autosave" | "explicit" | "restore" | "import";

export interface StructuredBlockProjection {
  readonly id: EntityId;
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly data: JsonObject;
  readonly orderKey: string;
  readonly renderedText: string;
}

export interface SaveJournalSnapshot {
  readonly journalId: EntityId;
  readonly journalDate: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly contentJson: JsonObject;
  readonly editorSchemaVersion: number;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly expectedRevision: number | null;
  readonly checkpoint: JournalSaveCheckpoint;
  readonly tags: readonly string[];
  readonly structuredBlocks: readonly StructuredBlockProjection[];
  readonly searchDocuments: readonly SearchDocument[];
  readonly savedAt: UtcTimestamp;
}

export interface SavedJournalSnapshot {
  readonly journalId: EntityId;
  readonly revision: number;
  readonly savedAt: UtcTimestamp;
  readonly contentHash: ContentHash;
  readonly versionCreated: boolean;
  readonly searchIndexState: "ready" | "stale";
}

export interface JournalSaveState {
  readonly journalId: EntityId;
  readonly journalDate: LocalDate;
  readonly timezone: string;
  readonly revision: number;
  readonly title: string;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly tags: readonly string[];
  readonly updatedAt: UtcTimestamp;
}

export interface JournalListQuery extends PageRequest {
  readonly fromDate?: LocalDate;
  readonly toDate?: LocalDate;
  readonly status?: "active" | "archived";
}

export interface JournalSummary {
  readonly id: EntityId;
  readonly journalDate: LocalDate;
  readonly title: string;
  readonly excerpt: string;
  readonly revision: number;
  readonly updatedAt: UtcTimestamp;
}

export interface JournalVersionSummary {
  readonly journalId: EntityId;
  readonly revision: number;
  readonly title: string;
  readonly changeSource: JournalVersion["changeSource"];
  readonly createdAt: UtcTimestamp;
}

export interface RestoreJournalVersionInput {
  readonly journalId: EntityId;
  readonly versionRevision: number;
  readonly expectedCurrentRevision: number;
  readonly restoredAt: UtcTimestamp;
}

export interface JournalRepository {
  getByDate(date: LocalDate): Promise<Journal | null>;
  getById(id: EntityId): Promise<Journal | null>;
  getSaveState(journalId: EntityId): Promise<JournalSaveState | null>;
  listSummaries(query: JournalListQuery): Promise<Page<JournalSummary>>;
  saveSnapshot(input: SaveJournalSnapshot): Promise<SavedJournalSnapshot>;
  listVersions(journalId: EntityId, page: PageRequest): Promise<Page<JournalVersionSummary>>;
  getVersion(journalId: EntityId, revision: number): Promise<JournalVersion | null>;
  restoreVersion(input: RestoreJournalVersionInput): Promise<SavedJournalSnapshot>;
  softDelete(journalId: EntityId, expectedRevision: number): Promise<void>;
}

export interface ContentProjectorInput {
  readonly content: ContentDocument;
  readonly tags: readonly string[];
  readonly searchContext?: SearchProjectionContext;
}

export interface SearchProjectionContext {
  readonly ownerEntityId: EntityId;
  readonly entityType: Exclude<SearchEntityType, "structured_block">;
  readonly title: string;
  readonly localDate: LocalDate | null;
  readonly updatedAt: UtcTimestamp;
}

export interface ProjectedContent {
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash;
  readonly excerpt: string;
  readonly structuredBlocks: readonly StructuredBlockProjection[];
  readonly searchDocuments: readonly SearchDocument[];
}

export interface ContentProjector {
  project(input: ContentProjectorInput): Promise<ProjectedContent>;
}

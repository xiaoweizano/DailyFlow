import type {
  EntityId,
  KnowledgeItem,
  KnowledgeKind,
  LocalDate,
  UtcTimestamp,
} from "@dailyflow/domain";

import type { Page, PageRequest } from "./pagination.js";

export interface KnowledgeListQuery extends PageRequest {
  readonly kind?: KnowledgeKind;
  readonly status?: "active" | "archived";
  readonly fromDate?: LocalDate;
  readonly toDate?: LocalDate;
}

export interface KnowledgeSummary {
  readonly id: EntityId;
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly summary: string;
  readonly revision: number;
  readonly updatedAt: UtcTimestamp;
}

export interface KnowledgeRepository {
  getById(id: EntityId): Promise<KnowledgeItem | null>;
  list(query: KnowledgeListQuery): Promise<Page<KnowledgeSummary>>;
  save(item: KnowledgeItem, expectedRevision: number | null): Promise<KnowledgeItem>;
  softDelete(id: EntityId, expectedRevision: number): Promise<void>;
}

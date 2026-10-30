import type { DomainDependencies } from "../shared/ports.js";
import {
  createContentDocument,
  parsePositiveInteger,
  type ContentDocument,
} from "../shared/content.js";
import { DomainRuleError } from "../shared/errors.js";
import {
  nextEntityId,
  nowUtc,
  parseEntityId,
  parseRevision,
  type ContentHash,
  type EntityId,
  type Revision,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const KNOWLEDGE_KINDS = ["note", "issue", "solution", "decision", "reference"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_STATUSES = ["active", "archived"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export interface KnowledgeItem {
  readonly id: EntityId;
  readonly kind: KnowledgeKind;
  readonly status: KnowledgeStatus;
  readonly title: string;
  readonly content: ContentDocument;
  readonly contentHash: ContentHash | null;
  readonly projectionVersion: number;
  readonly summary: string;
  readonly revision: Revision;
  readonly sourceJournalId: EntityId | null;
  readonly sourceBlockId: EntityId | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface CreateKnowledgeItemInput {
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly content: ContentDocument;
  readonly projectionVersion: number;
  readonly summary?: string;
  readonly sourceJournalId?: string | null;
  readonly sourceBlockId?: string | null;
}

export function createKnowledgeItem(
  input: CreateKnowledgeItemInput,
  dependencies: DomainDependencies,
): KnowledgeItem {
  if (!KNOWLEDGE_KINDS.includes(input.kind)) {
    throw new DomainRuleError("kind", `Unsupported knowledge kind: ${input.kind}`);
  }
  const projectionVersion = parsePositiveInteger(input.projectionVersion, "projectionVersion");
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    kind: input.kind,
    status: "active",
    title: input.title,
    content: createContentDocument(input.content.schemaVersion, input.content.doc),
    contentHash: null,
    projectionVersion,
    summary: input.summary ?? "",
    revision: parseRevision(0),
    sourceJournalId:
      input.sourceJournalId === undefined || input.sourceJournalId === null
        ? null
        : parseEntityId(input.sourceJournalId),
    sourceBlockId:
      input.sourceBlockId === undefined || input.sourceBlockId === null
        ? null
        : parseEntityId(input.sourceBlockId),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

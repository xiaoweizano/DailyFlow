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
  parseContentHash,
  parseEntityId,
  parseRevision,
  type ContentHash,
  type EntityId,
  type Revision,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const CHANGE_SOURCES = ["autosave", "explicit", "restore", "import", "migration"] as const;
export type ChangeSource = (typeof CHANGE_SOURCES)[number];

export interface JournalVersion {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly revision: Revision;
  readonly title: string;
  readonly content: ContentDocument;
  readonly contentHash: ContentHash;
  readonly projectionVersion: number;
  readonly changeSource: ChangeSource;
  readonly createdAt: UtcTimestamp;
}

export interface CreateJournalVersionInput {
  readonly journalId: string;
  readonly revision: number;
  readonly title: string;
  readonly content: ContentDocument;
  readonly contentHash: string;
  readonly projectionVersion: number;
  readonly changeSource: ChangeSource;
}

export function createJournalVersion(
  input: CreateJournalVersionInput,
  dependencies: DomainDependencies,
): JournalVersion {
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new DomainRuleError("revision", "JournalVersion revision must be positive");
  }
  if (!CHANGE_SOURCES.includes(input.changeSource)) {
    throw new DomainRuleError("changeSource", `Unsupported change source: ${input.changeSource}`);
  }
  const projectionVersion = parsePositiveInteger(input.projectionVersion, "projectionVersion");

  return {
    id: nextEntityId(dependencies.ids),
    journalId: parseEntityId(input.journalId),
    revision: parseRevision(input.revision),
    title: input.title,
    content: createContentDocument(input.content.schemaVersion, input.content.doc),
    contentHash: parseContentHash(input.contentHash),
    projectionVersion,
    changeSource: input.changeSource,
    createdAt: nowUtc(dependencies.clock),
  };
}

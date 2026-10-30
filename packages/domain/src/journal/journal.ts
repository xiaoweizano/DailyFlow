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
  parseLocalDate,
  parseRevision,
  requireNonEmptyString,
  type ContentHash,
  type EntityId,
  type LocalDate,
  type Revision,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const JOURNAL_STATUSES = ["active", "archived"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export interface Journal {
  readonly id: EntityId;
  readonly journalDate: LocalDate;
  readonly timezone: string;
  readonly title: string;
  readonly content: ContentDocument;
  readonly contentMarkdown: string;
  readonly contentPlainText: string;
  readonly contentHash: ContentHash | null;
  readonly projectionVersion: number;
  readonly excerpt: string;
  readonly status: JournalStatus;
  readonly revision: Revision;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface CreateJournalInput {
  readonly journalDate: string;
  readonly timezone: string;
  readonly title?: string;
  readonly content: ContentDocument;
  readonly projectionVersion: number;
  readonly contentMarkdown?: string;
  readonly contentPlainText?: string;
  readonly excerpt?: string;
}

export function createJournal(
  input: CreateJournalInput,
  dependencies: DomainDependencies,
): Journal {
  const projectionVersion = parsePositiveInteger(input.projectionVersion, "projectionVersion");
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    journalDate: parseLocalDate(input.journalDate),
    timezone: requireNonEmptyString(input.timezone, "timezone"),
    title: input.title ?? "",
    content: createContentDocument(input.content.schemaVersion, input.content.doc),
    contentMarkdown: input.contentMarkdown ?? "",
    contentPlainText: input.contentPlainText ?? "",
    contentHash: null,
    projectionVersion,
    excerpt: input.excerpt ?? "",
    status: "active",
    revision: parseRevision(0),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

export function setJournalContentHash(journal: Journal, contentHash: string): Journal {
  return { ...journal, contentHash: parseContentHash(contentHash) };
}

export function assertJournalStatus(status: string): asserts status is JournalStatus {
  if (!JOURNAL_STATUSES.includes(status as JournalStatus)) {
    throw new DomainRuleError("status", `Unsupported Journal status: ${status}`);
  }
}

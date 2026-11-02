import {
  createJournal,
  createJournalVersion,
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  setJournalContentHash,
  type Clock,
  type ContentHash,
  type EntityId,
  type IdGenerator,
  type Journal,
  type JournalVersion,
  type KnowledgeItem,
  type LocalDate,
  type Task,
  type UtcTimestamp,
} from "@dailyflow/domain";

import type {
  ContentProjector,
  ContentProjectorInput,
  ProjectedContent,
  SaveJournalSnapshot,
  SavedJournalSnapshot,
  JournalSaveState,
  JournalRepository,
} from "../src/ports/journal-repository.js";
import type { KnowledgeRepository } from "../src/ports/knowledge-repository.js";
import type { Page } from "../src/ports/pagination.js";
import type { TaskListQuery, TaskRepository } from "../src/ports/task-repository.js";

export const JOURNAL_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26";
export const OTHER_JOURNAL_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c27";
export const BLOCK_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c28";
export const TASK_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c29";
export const VERSION_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2a";
export const KNOWLEDGE_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c2b";
export const NOW = "2026-10-30T03:20:11.123Z";
export const CONTENT_HASH = "a".repeat(64);
export const PROJECTED_HASH = "b".repeat(64);
export const JOURNAL_ENTITY_ID = parseEntityId(JOURNAL_ID);
export const JOURNAL_DATE = parseLocalDate("2026-10-30");
export const NOW_TIMESTAMP = parseUtcTimestamp(NOW);
export const PROJECTED_CONTENT_HASH = parseContentHash(PROJECTED_HASH);

export const clock: Clock = {
  nowUtc: () => NOW,
};

export class SequenceIds implements IdGenerator {
  readonly #ids: string[];
  #index = 0;

  constructor(ids: readonly string[]) {
    this.#ids = [...ids];
  }

  nextId(): string {
    const id = this.#ids[this.#index];
    this.#index += 1;
    if (id === undefined) {
      throw new Error("SequenceIds exhausted");
    }
    return id;
  }
}

export class FakeProjector implements ContentProjector {
  readonly inputs: ContentProjectorInput[] = [];
  result: ProjectedContent = {
    contentMarkdown: "Deploy notes",
    contentPlainText: "Deploy notes",
    contentHash: parseContentHash(PROJECTED_HASH),
    excerpt: "Deploy notes",
    structuredBlocks: [],
    searchDocuments: [],
  };

  async project(input: ContentProjectorInput): Promise<ProjectedContent> {
    this.inputs.push(input);
    return this.result;
  }
}

export class FakeJournalRepository implements JournalRepository {
  journalById: Journal | null = null;
  saveState: JournalSaveState | null = null;
  version: JournalVersion | null = null;
  saveError: unknown = null;
  restoreError: unknown = null;
  readonly savedSnapshots: SaveJournalSnapshot[] = [];
  readonly restoredInputs: unknown[] = [];

  async getById(id: EntityId): Promise<Journal | null> {
    return this.journalById?.id === id ? this.journalById : null;
  }

  async getByDate(date: LocalDate): Promise<Journal | null> {
    return this.journalById?.journalDate === date ? this.journalById : null;
  }

  async getSaveState(journalId: EntityId): Promise<JournalSaveState | null> {
    return this.saveState?.journalId === journalId ? this.saveState : null;
  }

  async listSummaries(): Promise<Page<never>> {
    return { items: [], nextCursor: null };
  }

  async saveSnapshot(input: SaveJournalSnapshot): Promise<SavedJournalSnapshot> {
    if (this.saveError !== null) {
      throw this.saveError;
    }

    this.savedSnapshots.push(input);
    return {
      journalId: input.journalId,
      revision: (input.expectedRevision ?? 0) + 1,
      savedAt: input.savedAt,
      contentHash: PROJECTED_CONTENT_HASH,
      versionCreated: input.checkpoint !== "autosave",
      searchIndexState: "ready",
    };
  }

  async listVersions(): Promise<Page<never>> {
    return { items: [], nextCursor: null };
  }

  async getVersion(journalId: EntityId, revision: number): Promise<JournalVersion | null> {
    return this.version?.journalId === journalId && this.version.revision === revision
      ? this.version
      : null;
  }

  async restoreVersion(input: {
    readonly journalId: EntityId;
    readonly versionRevision: number;
    readonly expectedCurrentRevision: number;
    readonly restoredAt: UtcTimestamp;
  }): Promise<SavedJournalSnapshot> {
    if (this.restoreError !== null) {
      throw this.restoreError;
    }

    this.restoredInputs.push(input);
    return {
      journalId: JOURNAL_ENTITY_ID,
      revision: 4,
      savedAt: NOW_TIMESTAMP,
      contentHash: PROJECTED_CONTENT_HASH,
      versionCreated: true,
      searchIndexState: "ready",
    };
  }

  async softDelete(): Promise<void> {}
}

export class FakeKnowledgeRepository implements KnowledgeRepository {
  saveError: unknown = null;
  readonly savedItems: Array<{ item: KnowledgeItem; expectedRevision: number | null }> = [];

  async getById(id: EntityId): Promise<KnowledgeItem | null> {
    return this.savedItems.find(({ item }) => item.id === id)?.item ?? null;
  }

  async list(): Promise<Page<never>> {
    return { items: [], nextCursor: null };
  }

  async save(item: KnowledgeItem, expectedRevision: number | null): Promise<KnowledgeItem> {
    if (this.saveError !== null) {
      throw this.saveError;
    }

    this.savedItems.push({ item, expectedRevision });
    return item;
  }

  async softDelete(): Promise<void> {}
}

export class FakeTaskRepository implements TaskRepository {
  completeError: unknown = null;
  taskById: Task | null = null;
  readonly saved: Array<{ task: Task; expectedRevision: number | null }> = [];
  completion: {
    id: EntityId;
    completedAt: UtcTimestamp;
    expectedRevision: number;
  } | null = null;

  async list(query: TaskListQuery): Promise<{ items: readonly Task[]; nextCursor: string | null }> {
    void query;
    return { items: [], nextCursor: null };
  }

  async getById(id: EntityId): Promise<Task | null> {
    return this.taskById?.id === id ? this.taskById : null;
  }

  async save(task: Task, expectedRevision: number | null): Promise<Task> {
    this.saved.push({ task, expectedRevision });
    return task;
  }

  async complete(id: EntityId, completedAt: UtcTimestamp, expectedRevision: number): Promise<Task> {
    if (this.completeError !== null) {
      throw this.completeError;
    }

    this.completion = { id, completedAt, expectedRevision };
    const task = makeTask();
    return {
      ...task,
      status: "done",
      completedAt,
      updatedAt: completedAt,
      revision: parseRevision(expectedRevision + 1),
    };
  }

  async softDelete(): Promise<void> {}
}

export function makeJournal(overrides: Partial<Journal> = {}): Journal {
  const journal = createJournal(
    {
      journalDate: "2026-10-30",
      timezone: "Asia/Shanghai",
      title: "Deploy incident",
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [],
        },
      },
      projectionVersion: 1,
    },
    {
      ids: { nextId: () => JOURNAL_ID },
      clock,
    },
  );
  const hashed = setJournalContentHash(journal, CONTENT_HASH);

  return {
    ...hashed,
    revision: parseRevision(3),
    ...overrides,
  };
}

export function makeJournalVersion(): JournalVersion {
  return createJournalVersion(
    {
      journalId: JOURNAL_ID,
      revision: 2,
      title: "Deploy incident",
      content: {
        schemaVersion: 1,
        doc: {
          type: "doc",
          content: [],
        },
      },
      contentHash: CONTENT_HASH,
      projectionVersion: 1,
      changeSource: "explicit",
    },
    {
      ids: { nextId: () => VERSION_ID },
      clock,
    },
  );
}

export function makeTask(): Task {
  return {
    id: parseEntityId(TASK_ID),
    title: "Review deployment",
    description: null,
    descriptionText: "",
    status: "open",
    priority: "normal",
    dueDate: parseLocalDate("2026-10-31"),
    completedAt: null,
    journalId: null,
    knowledgeItemId: null,
    revision: parseRevision(2),
    createdAt: parseUtcTimestamp(NOW),
    updatedAt: parseUtcTimestamp(NOW),
    deletedAt: null,
  };
}

export function createContentHash(value: string = PROJECTED_HASH): ContentHash {
  return parseContentHash(value);
}

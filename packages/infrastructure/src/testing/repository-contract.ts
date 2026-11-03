import {
  createContentDocument,
  createKnowledgeItem,
  createTask,
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
  type Clock,
  type ContentHash,
  type EntityId,
  type IdGenerator,
  type KnowledgeItem,
  type LocalDate,
  type Task,
} from "@dailyflow/domain";
import type {
  JournalSaveState,
  JournalRepository,
  JournalVersionSummary,
  KnowledgeRepository,
  SavedJournalSnapshot,
  SaveJournalSnapshot,
  SearchDocument,
  SearchPort,
  TaskRepository,
} from "@dailyflow/application";
import { describe, expect, it } from "vitest";

import { PortError } from "@dailyflow/application";

const CONTENT_HASH = parseContentHash("a".repeat(64));
const SECOND_CONTENT_HASH = parseContentHash("b".repeat(64));

export const CONTRACT_IDS = {
  journal: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26"),
  secondJournal: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c27"),
  thirdJournal: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c28"),
  fourthJournal: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29"),
  block: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2a"),
  knowledge: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2b"),
  secondKnowledge: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2c"),
  task: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c2d"),
} as const;

export class MutableClock implements Clock {
  constructor(private value = "2026-10-30T03:20:11.123Z") {}

  nowUtc(): string {
    return this.value;
  }

  set(value: string): void {
    parseUtcTimestamp(value);
    this.value = value;
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private sequence = 0;
  private readonly initialIds: readonly string[];

  constructor(initialIds: readonly string[] = []) {
    initialIds.forEach(parseEntityId);
    this.initialIds = initialIds;
  }

  nextId(): string {
    const initialId = this.initialIds[this.sequence];
    this.sequence += 1;
    return initialId ?? `0198e2f4-7e33-7c70-a8b2-${this.sequence.toString(16).padStart(12, "0")}`;
  }
}

export interface SearchIndexWriter {
  replaceDocuments(ownerEntityId: EntityId, documents: readonly SearchDocument[]): Promise<void>;
  removeEntity(ownerEntityId: EntityId): Promise<void>;
}

export interface JournalRepositoryHarness {
  readonly journals: JournalRepository;
  readonly search: SearchPort & SearchIndexWriter;
  readonly clock: MutableClock;
}

export interface KnowledgeRepositoryHarness {
  readonly knowledge: KnowledgeRepository;
  readonly clock: MutableClock;
}

export interface TaskRepositoryHarness {
  readonly tasks: TaskRepository;
  readonly clock: MutableClock;
}

export interface SearchPortHarness {
  readonly search: SearchPort & SearchIndexWriter;
  readonly clock: MutableClock;
  readonly seedRebuildAuthority?: () => Promise<void>;
}

export interface JournalParityFixture {
  readonly initialSnapshot: SaveJournalSnapshot;
  readonly updateSnapshot: SaveJournalSnapshot;
  readonly expected: {
    readonly initialSave: SavedJournalSnapshot;
    readonly updateSave: SavedJournalSnapshot;
    readonly saveStateAfterUpdate: JournalSaveState;
    readonly versions: readonly JournalVersionSummary[];
    readonly blockSearch: {
      readonly text: string;
      readonly expected: readonly {
        readonly entityType: SearchDocument["entityType"];
        readonly entityId: EntityId;
        readonly localDate: LocalDate;
      }[];
    };
    readonly conflict: {
      readonly expectedRevision: number;
      readonly actualRevision: number;
      readonly code: "CONFLICT";
    };
    readonly softDeleteAt: string;
  };
  readonly enums: {
    readonly checkpoint: readonly string[];
    readonly changeSource: readonly string[];
    readonly searchEntityType: readonly string[];
    readonly storageErrorCode: readonly string[];
  };
}

function contentDocument(text: string) {
  return createContentDocument(1, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

export function makeSearchDocument(input: {
  readonly id: EntityId;
  readonly entityType: SearchDocument["entityType"];
  readonly entityId: EntityId;
  readonly title: string;
  readonly bodyText?: string;
  readonly normalizedText?: string;
  readonly localDate?: LocalDate | null;
  readonly updatedAt?: string;
  readonly contentHash?: ContentHash;
}): SearchDocument {
  const updatedAt = parseUtcTimestamp(input.updatedAt ?? "2026-10-30T03:20:11.123Z");
  const bodyText = input.bodyText ?? "";
  const normalizedText =
    input.normalizedText ?? `${input.title} ${bodyText}`.normalize("NFKC").toLowerCase();

  return {
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    bodyText,
    structuredText: "",
    tagsText: "",
    normalizedText,
    tokenizedText: normalizedText,
    localDate: input.localDate ?? null,
    updatedAt,
    contentHash: input.contentHash ?? CONTENT_HASH,
    indexVersion: 1,
  };
}

export function makeJournalSnapshot(input: {
  readonly journalId: EntityId;
  readonly journalDate: LocalDate;
  readonly title?: string;
  readonly bodyText?: string;
  readonly expectedRevision: number | null;
  readonly checkpoint?: "autosave" | "explicit" | "restore" | "import";
  readonly savedAt?: string;
  readonly contentHash?: ContentHash;
  readonly searchDocuments?: readonly SearchDocument[];
}) {
  const savedAt = parseUtcTimestamp(input.savedAt ?? "2026-10-30T03:20:11.123Z");
  const bodyText = input.bodyText ?? "Deploy notes";
  const contentHash = input.contentHash ?? CONTENT_HASH;
  const defaultSearchDocuments = [
    makeSearchDocument({
      id: input.journalId,
      entityType: "journal",
      entityId: input.journalId,
      title: input.title ?? "Deploy notes",
      bodyText,
      localDate: input.journalDate,
      updatedAt: savedAt,
      contentHash,
    }),
  ];

  return {
    journalId: input.journalId,
    journalDate: input.journalDate,
    timezone: "Asia/Shanghai",
    title: input.title ?? "Deploy notes",
    contentJson: contentDocument(bodyText).doc,
    editorSchemaVersion: 1,
    contentMarkdown: bodyText,
    contentPlainText: bodyText,
    contentHash,
    projectionVersion: 1,
    excerpt: bodyText,
    expectedRevision: input.expectedRevision,
    checkpoint: input.checkpoint ?? "explicit",
    tags: ["work"],
    structuredBlocks: [],
    searchDocuments: input.searchDocuments ?? defaultSearchDocuments,
    savedAt,
  };
}

function expectConflict(error: unknown, expectedRevision: number, actualRevision: number): void {
  expect(error).toBeInstanceOf(PortError);
  if (!(error instanceof PortError)) {
    throw error;
  }
  expect(error.code).toBe("CONFLICT");
  expect(error.details.expectedRevision).toBe(expectedRevision);
  expect(error.details.actualRevision).toBe(actualRevision);
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the repository operation to fail");
}

export function describeJournalRepositoryContract(
  name: string,
  createHarness: () => JournalRepositoryHarness,
): void {
  describe(name, () => {
    it("creates a snapshot and reads it back by id and date", async () => {
      const { journals } = createHarness();
      const snapshot = makeJournalSnapshot({
        journalId: CONTRACT_IDS.journal,
        journalDate: parseLocalDate("2026-10-30"),
        expectedRevision: null,
      });

      const saved = await journals.saveSnapshot(snapshot);
      const byId = await journals.getById(CONTRACT_IDS.journal);
      const byDate = await journals.getByDate(parseLocalDate("2026-10-30"));

      expect(saved).toMatchObject({
        journalId: CONTRACT_IDS.journal,
        revision: 1,
        versionCreated: true,
        searchIndexState: "ready",
      });
      expect(byId).toMatchObject({
        id: CONTRACT_IDS.journal,
        journalDate: "2026-10-30",
        title: "Deploy notes",
        revision: 1,
      });
      expect(byDate?.id).toBe(CONTRACT_IDS.journal);
    });

    it("rejects revision mismatches without changing current data", async () => {
      const { journals } = createHarness();
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate: parseLocalDate("2026-10-30"),
          expectedRevision: null,
        }),
      );

      const error = await captureError(() =>
        journals.saveSnapshot(
          makeJournalSnapshot({
            journalId: CONTRACT_IDS.journal,
            journalDate: parseLocalDate("2026-10-30"),
            title: "Stale update",
            expectedRevision: 0,
          }),
        ),
      );

      expectConflict(error, 0, 1);
      expect((await journals.getById(CONTRACT_IDS.journal))?.title).toBe("Deploy notes");
    });

    it("allows only one active journal for the same date", async () => {
      const { journals } = createHarness();
      const journalDate = parseLocalDate("2026-10-30");
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          expectedRevision: null,
        }),
      );

      const error = await captureError(() =>
        journals.saveSnapshot(
          makeJournalSnapshot({
            journalId: CONTRACT_IDS.secondJournal,
            journalDate,
            expectedRevision: null,
          }),
        ),
      );

      expect(error).toBeInstanceOf(PortError);
      expect((error as PortError).code).toBe("CONFLICT");
    });

    it("hides soft-deleted journals and allows a new journal on the same date", async () => {
      const { journals, search, clock } = createHarness();
      const journalDate = parseLocalDate("2026-10-30");
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          expectedRevision: null,
        }),
      );

      clock.set("2026-10-31T01:00:00.000Z");
      await journals.softDelete(CONTRACT_IDS.journal, 1);

      expect(await journals.getById(CONTRACT_IDS.journal)).toBeNull();
      expect(await journals.getByDate(journalDate)).toBeNull();
      expect((await search.query({ text: "deploy", limit: 20 })).items).toHaveLength(0);

      const recreated = await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.secondJournal,
          journalDate,
          title: "Recreated",
          expectedRevision: null,
        }),
      );
      expect(recreated.revision).toBe(1);
    });

    it("paginates journal summaries with a stable keyset cursor", async () => {
      const { journals } = createHarness();
      for (const [journalId, journalDate] of [
        [CONTRACT_IDS.journal, "2026-10-28"],
        [CONTRACT_IDS.secondJournal, "2026-10-29"],
        [CONTRACT_IDS.thirdJournal, "2026-10-30"],
      ] as const) {
        await journals.saveSnapshot(
          makeJournalSnapshot({
            journalId,
            journalDate: parseLocalDate(journalDate),
            title: journalDate,
            expectedRevision: null,
          }),
        );
      }

      const first = await journals.listSummaries({ limit: 2 });
      expect(first.items.map((item) => item.journalDate)).toEqual(["2026-10-30", "2026-10-29"]);
      expect(first.nextCursor).not.toBeNull();

      const second = await journals.listSummaries({
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
        limit: 2,
      });
      expect(second.items.map((item) => item.journalDate)).toEqual(["2026-10-28"]);
      expect(second.nextCursor).toBeNull();
    });

    it("creates checkpoints only for explicit saves and restores versions as new revisions", async () => {
      const { journals, clock } = createHarness();
      const journalDate = parseLocalDate("2026-10-30");
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          title: "Version one",
          expectedRevision: null,
          checkpoint: "explicit",
        }),
      );

      clock.set("2026-10-30T03:25:00.000Z");
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          title: "Autosaved",
          expectedRevision: 1,
          checkpoint: "autosave",
          savedAt: "2026-10-30T03:25:00.000Z",
          contentHash: SECOND_CONTENT_HASH,
        }),
      );

      clock.set("2026-10-30T03:30:00.000Z");
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          title: "Version three",
          expectedRevision: 2,
          checkpoint: "explicit",
          savedAt: "2026-10-30T03:30:00.000Z",
          contentHash: parseContentHash("c".repeat(64)),
        }),
      );

      const firstVersions = await journals.listVersions(CONTRACT_IDS.journal, { limit: 1 });
      expect(firstVersions.items[0]?.revision).toBe(3);
      expect(firstVersions.nextCursor).not.toBeNull();
      const secondVersions = await journals.listVersions(CONTRACT_IDS.journal, {
        ...(firstVersions.nextCursor === null ? {} : { cursor: firstVersions.nextCursor }),
        limit: 10,
      });
      expect(secondVersions.items.map((item) => item.revision)).toEqual([1]);

      clock.set("2026-10-30T04:00:00.000Z");
      const restored = await journals.restoreVersion({
        journalId: CONTRACT_IDS.journal,
        versionRevision: 1,
        expectedCurrentRevision: 3,
        restoredAt: parseUtcTimestamp("2026-10-30T04:00:00.000Z"),
      });

      expect(restored.revision).toBe(4);
      expect(restored.versionCreated).toBe(true);
      expect((await journals.getById(CONTRACT_IDS.journal))?.title).toBe("Version one");
      expect((await journals.getVersion(CONTRACT_IDS.journal, 4))?.changeSource).toBe("restore");
      expect((await journals.getVersion(CONTRACT_IDS.journal, 1))?.title).toBe("Version one");
    });

    it("replaces all search documents owned by a journal on each save", async () => {
      const { journals, search } = createHarness();
      const journalDate = parseLocalDate("2026-10-30");
      const blockDocument = makeSearchDocument({
        id: CONTRACT_IDS.block,
        entityType: "structured_block",
        entityId: CONTRACT_IDS.block,
        title: "Database timeout",
        bodyText: "ERR_CONNECTION_RESET",
        localDate: journalDate,
      });
      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          expectedRevision: null,
          searchDocuments: [
            makeSearchDocument({
              id: CONTRACT_IDS.journal,
              entityType: "journal",
              entityId: CONTRACT_IDS.journal,
              title: "Deploy notes",
              bodyText: "Rollout completed",
              localDate: journalDate,
            }),
            blockDocument,
          ],
        }),
      );

      expect((await search.query({ text: "connection reset", limit: 20 })).items).toHaveLength(1);

      await journals.saveSnapshot(
        makeJournalSnapshot({
          journalId: CONTRACT_IDS.journal,
          journalDate,
          title: "No block",
          expectedRevision: 1,
          savedAt: "2026-10-30T04:00:00.000Z",
          contentHash: SECOND_CONTENT_HASH,
        }),
      );

      expect((await search.query({ text: "connection reset", limit: 20 })).items).toHaveLength(0);
      expect((await search.query({ text: "no block", limit: 20 })).items[0]?.entityType).toBe(
        "journal",
      );
    });
  });
}

export function describeJournalRepositoryParityContract(
  name: string,
  createHarness: () => JournalRepositoryHarness,
  fixture: JournalParityFixture,
): void {
  describe(name, () => {
    it("produces the shared Chinese journal, history, search, conflict, and delete semantics", async () => {
      const { journals, search, clock } = createHarness();

      const initialSave = await journals.saveSnapshot(fixture.initialSnapshot);
      expect(initialSave).toEqual(fixture.expected.initialSave);

      const blockHits = await search.query({
        text: fixture.expected.blockSearch.text,
        entityTypes: ["structured_block"],
        limit: 20,
      });
      expect(
        blockHits.items.map(({ entityType, entityId, localDate }) => ({
          entityType,
          entityId,
          localDate,
        })),
      ).toEqual(fixture.expected.blockSearch.expected);

      const updateSave = await journals.saveSnapshot(fixture.updateSnapshot);
      expect(updateSave).toEqual(fixture.expected.updateSave);
      expect(await journals.getSaveState(fixture.initialSnapshot.journalId)).toEqual(
        fixture.expected.saveStateAfterUpdate,
      );

      const versions = await journals.listVersions(fixture.initialSnapshot.journalId, {
        limit: 20,
      });
      expect(versions.items).toEqual(fixture.expected.versions);

      const conflict = await captureError(() => journals.saveSnapshot(fixture.updateSnapshot));
      expectConflict(
        conflict,
        fixture.expected.conflict.expectedRevision,
        fixture.expected.conflict.actualRevision,
      );

      clock.set(fixture.expected.softDeleteAt);
      await journals.softDelete(
        fixture.initialSnapshot.journalId,
        fixture.expected.updateSave.revision,
      );

      expect(await journals.getById(fixture.initialSnapshot.journalId)).toBeNull();
      expect(
        (
          await search.query({
            text: fixture.expected.blockSearch.text,
            entityTypes: ["structured_block"],
            limit: 20,
          })
        ).items,
      ).toHaveLength(0);
    });
  });
}

function makeKnowledgeItem(input: {
  readonly id: EntityId;
  readonly title: string;
  readonly clock: Clock;
}): KnowledgeItem {
  return {
    ...createKnowledgeItem(
      {
        kind: "note",
        title: input.title,
        content: contentDocument(input.title),
        projectionVersion: 1,
      },
      {
        ids: { nextId: () => input.id },
        clock: input.clock,
      },
    ),
    contentHash: CONTENT_HASH,
  };
}

export function describeKnowledgeRepositoryContract(
  name: string,
  createHarness: () => KnowledgeRepositoryHarness,
): void {
  describe(name, () => {
    it("creates, reads, updates, and soft-deletes an item with revision checks", async () => {
      const { knowledge, clock } = createHarness();
      const draft = makeKnowledgeItem({
        id: CONTRACT_IDS.knowledge,
        title: "Runtime issue",
        clock,
      });

      const created = await knowledge.save(draft, null);
      expect(created.revision).toBe(1);
      expect((await knowledge.getById(CONTRACT_IDS.knowledge))?.title).toBe("Runtime issue");

      clock.set("2026-10-30T04:00:00.000Z");
      const updated = await knowledge.save(
        {
          ...created,
          title: "Resolved runtime issue",
          updatedAt: parseUtcTimestamp(clock.nowUtc()),
        },
        1,
      );
      expect(updated.revision).toBe(2);

      const conflict = await captureError(() =>
        knowledge.save({ ...updated, title: "Stale update" }, 1),
      );
      expectConflict(conflict, 1, 2);

      await knowledge.softDelete(CONTRACT_IDS.knowledge, 2);
      expect(await knowledge.getById(CONTRACT_IDS.knowledge)).toBeNull();
      expect((await knowledge.list({ limit: 20 })).items).toHaveLength(0);
    });

    it("filters and paginates knowledge summaries", async () => {
      const { knowledge, clock } = createHarness();
      for (const [id, title] of [
        [CONTRACT_IDS.knowledge, "First"],
        [CONTRACT_IDS.secondKnowledge, "Second"],
      ] as const) {
        await knowledge.save(makeKnowledgeItem({ id, title, clock }), null);
        clock.set(
          id === CONTRACT_IDS.knowledge ? "2026-10-30T04:00:00.000Z" : "2026-10-30T05:00:00.000Z",
        );
      }

      const first = await knowledge.list({ kind: "note", status: "active", limit: 1 });
      expect(first.items[0]?.title).toBe("Second");
      expect(first.nextCursor).not.toBeNull();

      const second = await knowledge.list({
        kind: "note",
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
        limit: 1,
      });
      expect(second.items[0]?.title).toBe("First");
      expect(second.nextCursor).toBeNull();
    });
  });
}

function makeTaskItem(input: {
  readonly id: EntityId;
  readonly title: string;
  readonly clock: Clock;
}): Task {
  return createTask(
    {
      title: input.title,
      dueDate: "2026-11-01",
    },
    {
      ids: { nextId: () => input.id },
      clock: input.clock,
    },
  );
}

export function describeTaskRepositoryContract(
  name: string,
  createHarness: () => TaskRepositoryHarness,
): void {
  describe(name, () => {
    it("persists, completes, and soft-deletes tasks with optimistic concurrency", async () => {
      const { tasks, clock } = createHarness();
      const created = await tasks.save(
        makeTaskItem({ id: CONTRACT_IDS.task, title: "Ship release", clock }),
        null,
      );
      expect(created.revision).toBe(1);
      expect((await tasks.list({ limit: 20 })).items).toHaveLength(1);

      const conflict = await captureError(() =>
        tasks.complete(CONTRACT_IDS.task, parseUtcTimestamp("2026-10-30T04:00:00.000Z"), 0),
      );
      expectConflict(conflict, 0, 1);

      const completed = await tasks.complete(
        CONTRACT_IDS.task,
        parseUtcTimestamp("2026-10-30T04:00:00.000Z"),
        1,
      );
      expect(completed).toMatchObject({
        status: "done",
        completedAt: "2026-10-30T04:00:00.000Z",
        revision: 2,
      });

      await tasks.softDelete(CONTRACT_IDS.task, 2);
      expect((await tasks.list({ limit: 20 })).items).toHaveLength(0);
    });

    it("filters task lists by status and paginates without duplicates", async () => {
      const { tasks, clock } = createHarness();
      await tasks.save(makeTaskItem({ id: CONTRACT_IDS.task, title: "First", clock }), null);
      clock.set("2026-10-30T04:00:00.000Z");
      await tasks.save(
        makeTaskItem({ id: CONTRACT_IDS.secondKnowledge, title: "Second", clock }),
        null,
      );

      const first = await tasks.list({ status: ["open"], limit: 1 });
      const second = await tasks.list({
        status: ["open"],
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
        limit: 1,
      });

      expect(first.items).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();
      expect(second.items).toHaveLength(1);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      expect(second.nextCursor).toBeNull();
    });
  });
}

export function describeSearchPortContract(
  name: string,
  createHarness: () => SearchPortHarness,
): void {
  describe(name, () => {
    it("ranks title matches ahead of body-only matches", async () => {
      const { search } = createHarness();
      await search.replaceDocuments(CONTRACT_IDS.knowledge, [
        makeSearchDocument({
          id: CONTRACT_IDS.journal,
          entityType: "journal",
          entityId: CONTRACT_IDS.journal,
          title: "Deploy guide",
          bodyText: "General notes",
        }),
        makeSearchDocument({
          id: CONTRACT_IDS.secondJournal,
          entityType: "journal",
          entityId: CONTRACT_IDS.secondJournal,
          title: "General notes",
          bodyText: "Deploy completed",
        }),
      ]);

      const result = await search.query({ text: "deploy", limit: 10 });
      expect(result.items.map((item) => item.entityId)).toEqual([
        CONTRACT_IDS.journal,
        CONTRACT_IDS.secondJournal,
      ]);
    });

    it("finds normalized Chinese text and applies filters", async () => {
      const { search } = createHarness();
      await search.replaceDocuments(CONTRACT_IDS.journal, [
        makeSearchDocument({
          id: CONTRACT_IDS.journal,
          entityType: "journal",
          entityId: CONTRACT_IDS.journal,
          title: "数据库排查",
          bodyText: "连接超时，最终恢复",
          normalizedText: "数据库排查 连接超时 最终恢复",
          localDate: parseLocalDate("2026-10-30"),
        }),
      ]);

      const matching = await search.query({
        text: "连接超时",
        entityTypes: ["journal"],
        fromDate: parseLocalDate("2026-10-01"),
        toDate: parseLocalDate("2026-10-31"),
        limit: 20,
      });
      const excluded = await search.query({
        text: "连接超时",
        entityTypes: ["task"],
        limit: 20,
      });

      expect(matching.items).toHaveLength(1);
      expect(excluded.items).toHaveLength(0);
    });

    it("atomically replaces and removes all documents for an owner", async () => {
      const { search } = createHarness();
      await search.replaceDocuments(CONTRACT_IDS.block, [
        makeSearchDocument({
          id: CONTRACT_IDS.block,
          entityType: "structured_block",
          entityId: CONTRACT_IDS.block,
          title: "Old block",
          bodyText: "unique-old-term",
        }),
      ]);

      await search.replaceDocuments(CONTRACT_IDS.block, [
        makeSearchDocument({
          id: CONTRACT_IDS.block,
          entityType: "structured_block",
          entityId: CONTRACT_IDS.block,
          title: "New block",
          bodyText: "unique-new-term",
        }),
      ]);

      expect((await search.query({ text: "unique old term", limit: 20 })).items).toHaveLength(0);
      expect((await search.query({ text: "unique new term", limit: 20 })).items).toHaveLength(1);

      await search.removeEntity(CONTRACT_IDS.block);
      expect((await search.query({ text: "unique new term", limit: 20 })).items).toHaveLength(0);
    });

    it("paginates ranked results with an opaque cursor", async () => {
      const { search } = createHarness();
      const documents = [
        [CONTRACT_IDS.journal, "Release one", "2026-10-30T03:00:00.000Z"],
        [CONTRACT_IDS.secondJournal, "Release two", "2026-10-30T04:00:00.000Z"],
        [CONTRACT_IDS.thirdJournal, "Release three", "2026-10-30T05:00:00.000Z"],
      ] as const;
      for (const [id, title, updatedAt] of documents) {
        await search.replaceDocuments(id, [
          makeSearchDocument({
            id,
            entityType: "journal",
            entityId: id,
            title,
            updatedAt,
          }),
        ]);
      }

      const first = await search.query({ text: "release", limit: 2 });
      expect(first.items.map((item) => item.title)).toEqual(["Release three", "Release two"]);
      expect(first.nextCursor).not.toBeNull();

      const second = await search.query({
        text: "release",
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
        limit: 2,
      });
      expect(second.items.map((item) => item.title)).toEqual(["Release one"]);
      expect(second.nextCursor).toBeNull();
    });

    it("rebuilds the requested scope and reports ready index state", async () => {
      const { search, clock, seedRebuildAuthority } = createHarness();
      await search.replaceDocuments(CONTRACT_IDS.journal, [
        makeSearchDocument({
          id: CONTRACT_IDS.journal,
          entityType: "journal",
          entityId: CONTRACT_IDS.journal,
          title: "Journal",
        }),
        makeSearchDocument({
          id: CONTRACT_IDS.block,
          entityType: "structured_block",
          entityId: CONTRACT_IDS.block,
          title: "Block",
        }),
      ]);

      await seedRebuildAuthority?.();
      clock.set("2026-10-30T06:00:00.000Z");
      const rebuilt = await search.rebuild(["journal"]);
      const result = await search.query({ text: "journal", limit: 20 });

      expect(rebuilt).toEqual({
        indexedCount: 1,
        completedAt: "2026-10-30T06:00:00.000Z",
        status: "completed",
      });
      expect(result.indexState).toBe("ready");
    });
  });
}

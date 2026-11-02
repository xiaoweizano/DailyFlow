import "fake-indexeddb/auto";

import { PortError } from "@dailyflow/application";
import {
  parseContentHash,
  parseLocalDate,
  parseUtcTimestamp,
  type EntityId,
} from "@dailyflow/domain";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { DexieJournalRepository } from "../src/web/dexie-journal-repository.js";
import { DexieSearchPort } from "../src/web/dexie-search-port.js";
import {
  CONTRACT_IDS,
  MutableClock,
  SequenceIdGenerator,
  describeJournalRepositoryContract,
  makeJournalSnapshot,
} from "../src/testing/repository-contract.js";

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

function createHarness() {
  const database = createDatabase();
  const clock = new MutableClock();
  const search = new DexieSearchPort({ database, clock });
  return {
    database,
    journals: new DexieJournalRepository({
      database,
      ids: new SequenceIdGenerator(),
      clock,
      search,
    }),
    search,
    clock,
  };
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describeJournalRepositoryContract("Dexie JournalRepository contract", createHarness);

describe("Dexie schema and transaction boundaries", () => {
  it("creates the documented stores and initializes the data schema version", async () => {
    const database = createDatabase();

    await database.open();

    expect(database.tables.map((table) => table.name).sort()).toEqual(
      [
        "attachmentBlobs",
        "attachmentLinks",
        "importEntries",
        "importSessions",
        "journalTags",
        "journalVersions",
        "journals",
        "knowledgeItems",
        "knowledgeLinks",
        "knowledgeTags",
        "meta",
        "reports",
        "searchDocs",
        "searchTermPostings",
        "settings",
        "structuredBlocks",
        "tags",
        "tasks",
      ].sort(),
    );
    await expect(database.meta.get("dataSchemaVersion")).resolves.toMatchObject({
      key: "dataSchemaVersion",
      value: 1,
    });
  });

  it("commits journal, version, structured block, tag, search, and posting rows together", async () => {
    const { database, journals } = createHarness();
    const journalDate = parseLocalDate("2026-10-30");
    const blockId = CONTRACT_IDS.block;
    const snapshot = makeJournalSnapshot({
      journalId: CONTRACT_IDS.journal,
      journalDate,
      expectedRevision: null,
    });

    await journals.saveSnapshot({
      ...snapshot,
      tags: ["Work", "Rust"],
      structuredBlocks: [
        {
          id: blockId,
          blockType: "issue",
          schemaVersion: 1,
          data: { symptom: "timeout" },
          orderKey: "0001",
          renderedText: "Connection timeout",
        },
      ],
      searchDocuments: [
        ...snapshot.searchDocuments,
        {
          ...snapshot.searchDocuments[0]!,
          id: blockId,
          entityType: "structured_block",
          entityId: blockId,
          title: "Connection timeout",
        },
      ],
    });

    await expect(database.journals.count()).resolves.toBe(1);
    await expect(database.journalVersions.count()).resolves.toBe(1);
    await expect(database.structuredBlocks.where("journalId").equals(CONTRACT_IDS.journal).count()).resolves.toBe(1);
    await expect(database.tags.count()).resolves.toBe(2);
    await expect(database.journalTags.where("journalId").equals(CONTRACT_IDS.journal).count()).resolves.toBe(2);
    await expect(database.searchDocs.count()).resolves.toBe(2);
    await expect(
      database.searchTermPostings.where("docId").equals(CONTRACT_IDS.journal).count(),
    ).resolves.toBeGreaterThan(0);
  });

  it("rolls back every store when a write inside the save transaction fails", async () => {
    const { database, journals } = createHarness();
    const snapshot = makeJournalSnapshot({
      journalId: CONTRACT_IDS.journal,
      journalDate: parseLocalDate("2026-10-30"),
      expectedRevision: null,
    });
    const duplicateDocument = {
      ...snapshot.searchDocuments[0]!,
      id: CONTRACT_IDS.secondJournal,
    };
    const save = journals.saveSnapshot({
      ...snapshot,
      searchDocuments: [...snapshot.searchDocuments, duplicateDocument, duplicateDocument],
    });

    const error = await save.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect((error as PortError).code).toBe("CONFLICT");
    await expect(database.journals.count()).resolves.toBe(0);
    await expect(database.journalVersions.count()).resolves.toBe(0);
    await expect(database.searchDocs.count()).resolves.toBe(0);
  });

  it("stores restore checkpoints as new immutable revisions", async () => {
    const { database, journals, clock } = createHarness();
    const journalDate = parseLocalDate("2026-10-30");
    await journals.saveSnapshot(
      makeJournalSnapshot({
        journalId: CONTRACT_IDS.journal,
        journalDate,
        title: "Initial",
        expectedRevision: null,
      }),
    );
    clock.set("2026-10-30T04:00:00.000Z");
    await journals.saveSnapshot(
      makeJournalSnapshot({
        journalId: CONTRACT_IDS.journal,
        journalDate,
        title: "Current",
        expectedRevision: 1,
        savedAt: "2026-10-30T04:00:00.000Z",
        contentHash: parseContentHash("b".repeat(64)),
      }),
    );
    clock.set("2026-10-30T05:00:00.000Z");

    await journals.restoreVersion({
      journalId: CONTRACT_IDS.journal,
      versionRevision: 1,
      expectedCurrentRevision: 2,
      restoredAt: parseUtcTimestamp("2026-10-30T05:00:00.000Z"),
    });

    const versions = await database.journalVersions
      .where("journalId")
      .equals(CONTRACT_IDS.journal)
      .toArray();
    expect(versions).toHaveLength(3);
    expect(versions.find((version) => version.revision === 3)).toMatchObject({
      title: "Initial",
      changeSource: "restore",
    });
  });

  it("keeps deleted journal rows accessible to recovery while hiding them from active queries", async () => {
    const { database, journals, clock } = createHarness();
    await journals.saveSnapshot(
      makeJournalSnapshot({
        journalId: CONTRACT_IDS.journal,
        journalDate: parseLocalDate("2026-10-30"),
        expectedRevision: null,
      }),
    );
    clock.set("2026-10-31T01:00:00.000Z");

    await journals.softDelete(CONTRACT_IDS.journal as EntityId, 1);

    await expect(database.journals.get(CONTRACT_IDS.journal)).resolves.toMatchObject({
      status: "archived",
      revision: 2,
      deletedAt: "2026-10-31T01:00:00.000Z",
    });
    await expect(database.searchDocs.count()).resolves.toBe(0);
  });
});

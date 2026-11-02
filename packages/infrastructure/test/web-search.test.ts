import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { DexieSearchPort } from "../src/web/dexie-search-port.js";
import {
  CONTRACT_IDS,
  MutableClock,
  describeSearchPortContract,
  makeSearchDocument,
} from "../src/testing/repository-contract.js";

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createHarness() {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-search-test-${databaseSequence}`);
  openDatabases.push(database);
  const clock = new MutableClock();
  return {
    database,
    search: new DexieSearchPort({ database, clock }),
    clock,
  };
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describeSearchPortContract("Dexie SearchPort contract", createHarness);

describe("Dexie search index maintenance", () => {
  it("writes queryable term postings for the indexed document", async () => {
    const { database, search } = createHarness();

    await search.replaceDocuments(CONTRACT_IDS.journal, [
      makeSearchDocument({
        id: CONTRACT_IDS.journal,
        entityType: "journal",
        entityId: CONTRACT_IDS.journal,
        title: "数据库排查",
        bodyText: "连接超时，最终恢复",
        normalizedText: "数据库排查 连接超时 最终恢复",
      }),
    ]);

    const matchingPostings = await database.searchTermPostings
      .where("docId")
      .equals(CONTRACT_IDS.journal)
      .toArray();
    expect(matchingPostings.length).toBeGreaterThan(0);
    expect(matchingPostings.some((posting) => posting.term.includes("连接"))).toBe(true);
    expect((await search.query({ text: "连接超时", limit: 20 })).items).toHaveLength(1);
  });

  it("rebuilds selected postings from authoritative search documents", async () => {
    const { database, search, clock } = createHarness();
    await search.replaceDocuments(CONTRACT_IDS.journal, [
      makeSearchDocument({
        id: CONTRACT_IDS.journal,
        entityType: "journal",
        entityId: CONTRACT_IDS.journal,
        title: "Release checklist",
        bodyText: "Deploy rollback",
      }),
      makeSearchDocument({
        id: CONTRACT_IDS.knowledge,
        entityType: "knowledge_item",
        entityId: CONTRACT_IDS.knowledge,
        title: "Release knowledge",
      }),
    ]);
    await database.searchTermPostings.clear();
    await database.meta.put({ key: "searchIndexState", value: "stale" });
    clock.set("2026-10-30T06:00:00.000Z");

    const rebuilt = await search.rebuild(["journal"]);

    expect(rebuilt).toEqual({
      indexedCount: 1,
      completedAt: "2026-10-30T06:00:00.000Z",
    });
    await expect(database.meta.get("searchIndexState")).resolves.toMatchObject({ value: "ready" });
    expect((await search.query({ text: "release", limit: 20 })).items).toHaveLength(2);
    expect(
      await database.searchTermPostings.where("docId").equals(CONTRACT_IDS.knowledge).count(),
    ).toBe(0);
  });
});

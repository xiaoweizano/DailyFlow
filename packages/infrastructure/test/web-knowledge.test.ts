import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  MutableClock,
  describeKnowledgeRepositoryContract,
} from "../src/testing/repository-contract.js";
import { DailyFlowDb } from "../src/web/db.js";
import { DexieKnowledgeRepository } from "../src/web/dexie-knowledge-repository.js";
import { createWebServices } from "../src/web/web-services.js";

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-knowledge-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

function createHarness() {
  const database = createDatabase();
  const clock = new MutableClock();
  return {
    database,
    knowledge: new DexieKnowledgeRepository({ database, clock }),
    clock,
  };
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describe("Dexie KnowledgeRepository", () => {
  describeKnowledgeRepositoryContract("contract", createHarness);

  it("is exposed by the Web composition root", () => {
    const services = createWebServices({ database: createDatabase(), clock: new MutableClock() });

    expect(services.knowledge).toBeInstanceOf(DexieKnowledgeRepository);
  });
});

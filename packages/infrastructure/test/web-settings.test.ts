import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { WebSettingsStore } from "../src/web/web-settings-store.js";

const databases: DailyFlowDb[] = [];
let sequence = 0;

function createStore(): { database: DailyFlowDb; store: WebSettingsStore } {
  sequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-settings-${sequence}`);
  databases.push(database);
  return {
    database,
    store: new WebSettingsStore({ database }),
  };
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

describe("WebSettingsStore", () => {
  it("returns null when a key has not been persisted", async () => {
    const { store } = createStore();

    await expect(store.read("user-preferences")).resolves.toBeNull();
  });

  it("persists JSON text in the settings table", async () => {
    const { database, store } = createStore();
    const valueJson = JSON.stringify({ theme: "dark" });

    await store.write("user-preferences", valueJson);

    await expect(store.read("user-preferences")).resolves.toBe(valueJson);
    await expect(database.settings.get("user-preferences")).resolves.toMatchObject({
      key: "user-preferences",
      value: valueJson,
    });
  });
});

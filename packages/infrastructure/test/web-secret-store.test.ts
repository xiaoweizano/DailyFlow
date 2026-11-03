import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { WebSecretStore } from "../src/web/web-secret-store.js";

const databases: DailyFlowDb[] = [];
let sequence = 0;
const localValues = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length(): number {
      return localValues.size;
    },
    clear: (): void => localValues.clear(),
    getItem: (key: string): string | null => localValues.get(key) ?? null,
    key: (index: number): string | null => [...localValues.keys()][index] ?? null,
    removeItem: (key: string): void => {
      localValues.delete(key);
    },
    setItem: (key: string, value: string): void => {
      localValues.set(key, value);
    },
  } satisfies Storage,
});

function createDatabase(): DailyFlowDb {
  sequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-secrets-${sequence}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  globalThis.localStorage.clear();
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

describe("WebSecretStore", () => {
  it("keeps secrets only in its session-memory backend", async () => {
    const store = new WebSecretStore();

    expect(store.backend).toBe("session-memory");
    await store.set("provider/api-key", "sensitive-value");
    await expect(store.get("provider/api-key")).resolves.toBe("sensitive-value");

    await store.delete("provider/api-key");
    await expect(store.get("provider/api-key")).resolves.toBeNull();
  });

  it("isolates secrets between store instances", async () => {
    const first = new WebSecretStore();
    const second = new WebSecretStore();

    await first.set("provider/api-key", "first-only");

    await expect(second.get("provider/api-key")).resolves.toBeNull();
  });

  it("rejects empty references and values", async () => {
    const store = new WebSecretStore();

    await expect(store.get(" ")).rejects.toThrow("凭据引用不能为空");
    await expect(store.set("", "value")).rejects.toThrow("凭据引用不能为空");
    await expect(store.delete("\t")).rejects.toThrow("凭据引用不能为空");
    await expect(store.set("provider/api-key", "")).rejects.toThrow("凭据内容不能为空");
  });

  it("never writes secret values to localStorage or IndexedDB settings", async () => {
    const database = createDatabase();
    const store = new WebSecretStore();
    const secret = "never-persist-this-api-key";

    await store.set("provider/api-key", secret);

    expect(JSON.stringify(Object.fromEntries(localValues))).not.toContain(secret);
    const settings = await database.settings.toArray();
    expect(JSON.stringify(settings)).not.toContain(secret);
  });
});

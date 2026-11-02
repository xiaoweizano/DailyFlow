import "fake-indexeddb/auto";

import { parseEntityId, parseUtcTimestamp, type EntityId } from "@dailyflow/domain";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { WebAttachmentStore } from "../src/web/web-attachment-store.js";
import { MutableClock, SequenceIdGenerator } from "../src/testing/repository-contract.js";

const OWNER_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26" as EntityId;
const OTHER_OWNER_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c27" as EntityId;
const DUPLICATE_LINK_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29");

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-attachment-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describe("WebAttachmentStore", () => {
  it("deduplicates blob content while creating a link for each owner", async () => {
    const database = createDatabase();
    const store = new WebAttachmentStore({
      database,
      clock: new MutableClock(),
      ids: new SequenceIdGenerator(),
    });
    const bytes = new TextEncoder().encode("same content");

    const first = await store.put({
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "first.txt",
      mimeType: "text/plain",
      bytes,
    });
    const second = await store.put({
      ownerType: "journal",
      ownerId: OTHER_OWNER_ID,
      displayName: "second.txt",
      mimeType: "text/plain",
      bytes,
    });

    expect(first.attachment.blobId).toBe(second.attachment.blobId);
    expect(first.attachment.id).not.toBe(second.attachment.id);
    expect(first.contentHash).toHaveLength(64);
    await expect(database.attachmentBlobs.count()).resolves.toBe(1);
    await expect(database.attachmentLinks.count()).resolves.toBe(2);
  });

  it("rolls back the blob when writing its link fails in the same transaction", async () => {
    const database = createDatabase();
    const clock = new MutableClock();
    const store = new WebAttachmentStore({
      database,
      clock,
      ids: new SequenceIdGenerator(["0198e2f4-7e33-7c70-a8b2-18c1520f9c28", DUPLICATE_LINK_ID]),
    });
    await database.attachmentLinks.add({
      id: DUPLICATE_LINK_ID,
      blobId: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c30"),
      ownerType: "journal",
      ownerId: OTHER_OWNER_ID,
      displayName: "seed.txt",
      altText: "",
      isInline: false,
      sortOrder: 0,
      createdAt: parseUtcTimestamp(clock.nowUtc()),
      deletedAt: null,
    });

    await expect(
      store.put({
        ownerType: "journal",
        ownerId: OWNER_ID,
        displayName: "rollback.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("must roll back"),
      }),
    ).rejects.toBeDefined();

    await expect(database.attachmentBlobs.count()).resolves.toBe(0);
    await expect(database.attachmentLinks.count()).resolves.toBe(1);
  });

  it("marks a blob orphaned after the last owner link is removed", async () => {
    const database = createDatabase();
    const clock = new MutableClock();
    const store = new WebAttachmentStore({
      database,
      clock,
      ids: new SequenceIdGenerator(),
    });
    const stored = await store.put({
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "temporary.txt",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("temporary"),
    });
    clock.set("2026-10-31T03:20:11.123Z");

    await store.softDeleteOwnerLinks("journal", OWNER_ID);

    await expect(database.attachmentLinks.get(stored.attachment.id)).resolves.toMatchObject({
      deletedAt: "2026-10-31T03:20:11.123Z",
    });
    await expect(database.attachmentBlobs.get(stored.attachment.blobId)).resolves.toMatchObject({
      orphanedAt: "2026-10-31T03:20:11.123Z",
    });
    await expect(store.read(stored.attachment.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

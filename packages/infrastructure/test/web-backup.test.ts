import "fake-indexeddb/auto";

import { PortError, type BackupArtifact } from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
  type EntityId,
  type LocalDate,
  type UtcTimestamp,
} from "@dailyflow/domain";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import type {
  AttachmentBlobRow,
  AttachmentLinkRow,
  ImportEntryRow,
  ImportSessionRow,
  JournalRow,
  JournalTagRow,
  TagRow,
} from "../src/web/schema.js";
import { WebBackupService } from "../src/web/web-backup-service.js";

const DEVICE_ID = parseEntityId("019a3c10-0000-7000-8000-000000000001");
const JOURNAL_ID = parseEntityId("019a3c10-0000-7000-8000-000000000002");
const SECOND_JOURNAL_ID = parseEntityId("019a3c10-0000-7000-8000-000000000003");
const BLOB_ID = parseEntityId("019a3c10-0000-7000-8000-000000000004");
const ATTACHMENT_ID = parseEntityId("019a3c10-0000-7000-8000-000000000005");
const TAG_ID = parseEntityId("019a3c10-0000-7000-8000-000000000006");
const SESSION_ID = parseEntityId("019a3c10-0000-7000-8000-000000000007");
const ENTRY_ID = parseEntityId("019a3c10-0000-7000-8000-000000000008");
const CREATED_AT = parseUtcTimestamp("2026-11-03T08:00:00.000Z");
const RESTORED_AT = parseUtcTimestamp("2026-11-03T09:00:00.000Z");

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-backup-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function journal(
  id: EntityId = JOURNAL_ID,
  journalDate: LocalDate = parseLocalDate("2026-11-03"),
  title = "Daily backup",
): JournalRow {
  return {
    id,
    journalDate,
    timezone: "Asia/Shanghai",
    title,
    contentJson: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
    }),
    editorSchemaVersion: 1,
    contentMarkdown: title,
    contentPlainText: title,
    contentHash: parseContentHash("a".repeat(64)),
    projectionVersion: 1,
    excerpt: title,
    status: "active",
    revision: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
  };
}

function tag(): TagRow {
  return {
    id: TAG_ID,
    name: "backup",
    nameNormalized: "backup",
    color: "#2563eb",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function journalTag(): JournalTagRow {
  return { journalId: JOURNAL_ID, tagId: TAG_ID };
}

async function attachmentBytes(): Promise<Uint8Array> {
  return new TextEncoder().encode("portable attachment");
}

async function attachmentBlob(): Promise<AttachmentBlobRow> {
  const bytes = await attachmentBytes();
  return {
    id: BLOB_ID,
    sha256: parseContentHash(await sha256Hex(bytes)),
    byteSize: bytes.byteLength,
    mimeType: "text/plain",
    storageKind: "web-blob",
    storageKey: BLOB_ID,
    bytes: new Blob([bytes.slice()], { type: "text/plain" }),
    createdAt: CREATED_AT,
    orphanedAt: null,
  };
}

function attachmentLink(): AttachmentLinkRow {
  return {
    id: ATTACHMENT_ID,
    blobId: BLOB_ID,
    ownerType: "journal",
    ownerId: JOURNAL_ID,
    displayName: "note.txt",
    altText: "note",
    isInline: false,
    sortOrder: 0,
    createdAt: CREATED_AT,
    deletedAt: null,
  };
}

function importSession(): ImportSessionRow {
  return {
    id: SESSION_ID,
    rootLabel: "legacy",
    status: "completed",
    optionsJson: "{}",
    revision: 1,
    scannedCount: 1,
    readyCount: 1,
    importedCount: 1,
    skippedCount: 0,
    conflictCount: 0,
    invalidCount: 0,
    createdAt: CREATED_AT,
    completedAt: CREATED_AT,
    errorSummary: null,
  };
}

async function importEntry(): Promise<ImportEntryRow> {
  const rawBytes = new TextEncoder().encode("legacy text");
  return {
    id: ENTRY_ID,
    sessionId: SESSION_ID,
    relativePath: "202611/20261103.txt",
    originalFileName: "20261103.txt",
    detectedDate: parseLocalDate("2026-11-03"),
    encoding: "utf8",
    newlineStyle: "lf",
    fileSha256: await sha256Hex(rawBytes),
    rawSize: rawBytes.byteLength,
    rawCaptureStatus: "captured",
    rawBytes,
    rawCleanedAt: null,
    status: "imported",
    conflictKind: null,
    errorCode: null,
    errorDetail: null,
    journalId: JOURNAL_ID,
    previousJournalRevision: null,
    createdAt: CREATED_AT,
    committedAt: CREATED_AT,
  };
}

async function seedBusinessData(database: DailyFlowDb): Promise<void> {
  const blob = await attachmentBlob();
  const entry = await importEntry();
  await database.transaction(
    "rw",
    [
      database.journals,
      database.tags,
      database.journalTags,
      database.attachmentBlobs,
      database.attachmentLinks,
      database.importSessions,
      database.importEntries,
    ],
    async () => {
      await database.journals.add(journal());
      await database.tags.add(tag());
      await database.journalTags.add(journalTag());
      await database.attachmentBlobs.add(blob);
      await database.attachmentLinks.add(attachmentLink());
      await database.importSessions.add(importSession());
      await database.importEntries.add(entry);
    },
  );
}

function service(database: DailyFlowDb, nowUtc: UtcTimestamp = RESTORED_AT): WebBackupService {
  return new WebBackupService({
    database,
    clock: { nowUtc: () => nowUtc },
    deviceId: DEVICE_ID,
    appVersion: "0.1.0",
  });
}

async function createArchive(backup: WebBackupService): Promise<BackupArtifact> {
  return backup.create({
    fileName: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
    createdAt: CREATED_AT,
  });
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describe("WebBackupService", () => {
  it("creates a portable archive from one consistent IndexedDB snapshot", async () => {
    const database = createDatabase();
    await seedBusinessData(database);
    const backup = service(database);

    const artifact = await createArchive(backup);
    const inspected = await backup.inspect(artifact.bytes);

    expect(artifact.manifest).toMatchObject({
      format: "dailyflow-backup",
      schemaVersion: 1,
      dataSchemaVersion: 1,
      attachmentCount: 1,
      rawImportFileCount: 1,
    });
    expect(inspected.dataset.journals).toEqual([
      expect.objectContaining({ id: JOURNAL_ID, title: "Daily backup" }),
    ]);
    expect(inspected.dataset.journalTags).toEqual([{ journalId: JOURNAL_ID, tagId: TAG_ID }]);
    expect(inspected.dataset.attachments).toEqual([
      expect.objectContaining({
        link: expect.objectContaining({ id: ATTACHMENT_ID }),
        blob: expect.not.objectContaining({
          storageKind: expect.anything(),
          storageKey: expect.anything(),
        }),
      }),
    ]);
    expect(new TextDecoder().decode(inspected.dataset.attachments[0]?.bytes)).toBe(
      "portable attachment",
    );
    const rawPath = inspected.dataset.importEntries[0]?.rawBlobPath;
    const rawFile = inspected.files.find((file) => file.path === rawPath);
    expect(new TextDecoder().decode(rawFile?.bytes)).toBe("legacy text");
  });

  it("persists one generated device id across service instances", async () => {
    const database = createDatabase();
    let sequence = 0;
    const options = {
      database,
      clock: { nowUtc: () => RESTORED_AT },
      appVersion: "0.1.0",
      ids: {
        nextId: () => `019a3c10-0000-7001-8000-${String(++sequence).padStart(12, "0")}`,
      },
    };
    const firstArtifact = await new WebBackupService(options).create({
      fileName: "first.zip",
      createdAt: CREATED_AT,
    });
    const secondArtifact = await new WebBackupService(options).create({
      fileName: "second.zip",
      createdAt: CREATED_AT,
    });

    expect(secondArtifact.manifest.deviceId).toBe(firstArtifact.manifest.deviceId);
    await expect(database.meta.get("deviceId")).resolves.toMatchObject({
      value: firstArtifact.manifest.deviceId,
    });
  });

  it("rejects a mismatched content digest before changing local data", async () => {
    const database = createDatabase();
    await seedBusinessData(database);
    const backup = service(database);
    const artifact = await createArchive(backup);

    const error = await backup
      .restore(artifact.bytes, {
        expectedContentDigest: "0".repeat(64),
        replaceExisting: true,
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect((error as PortError).code).toBe("BACKUP_INVALID");
    await expect(database.journals.get(JOURNAL_ID)).resolves.toMatchObject({
      title: "Daily backup",
    });
    await expect(database.meta.get("lastRestoreSafetySnapshot")).resolves.toBeUndefined();
  });

  it("restores a complete archive atomically and preserves a safety snapshot", async () => {
    const database = createDatabase();
    await seedBusinessData(database);
    const backup = service(database);
    const original = await createArchive(backup);

    await database.journals.add(
      journal(SECOND_JOURNAL_ID, parseLocalDate("2026-11-04"), "Added after backup"),
    );
    await database.searchDocs.add({
      id: parseEntityId("019a3c10-0000-7000-8000-000000000009"),
      ownerEntityId: JOURNAL_ID,
      entityType: "journal",
      entityId: JOURNAL_ID,
      title: "stale search document",
      bodyText: "",
      structuredText: "",
      tagsText: "",
      normalizedText: "",
      tokenizedText: "",
      localDate: parseLocalDate("2026-11-03"),
      updatedAt: CREATED_AT,
      contentHash: parseContentHash("b".repeat(64)),
      indexVersion: 1,
    });

    const result = await backup.restore(original.bytes, {
      expectedContentDigest: original.manifest.contentDigest,
      replaceExisting: true,
    });

    expect(result.manifest.contentDigest).toBe(original.manifest.contentDigest);
    expect(result.safetySnapshot).toMatchObject({
      contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    await expect(database.journals.count()).resolves.toBe(1);
    await expect(database.journals.get(SECOND_JOURNAL_ID)).resolves.toBeUndefined();
    await expect(database.journals.get(JOURNAL_ID)).resolves.toMatchObject({
      title: "Daily backup",
      journalDate: "2026-11-03",
    });
    await expect(database.searchDocs.count()).resolves.toBe(0);
    await expect(database.searchTermPostings.count()).resolves.toBe(0);
    await expect(database.meta.get("searchIndexState")).resolves.toMatchObject({
      value: "stale",
    });

    const blob = await database.attachmentBlobs.get(BLOB_ID);
    expect(blob).toMatchObject({
      storageKind: "web-blob",
      storageKey: BLOB_ID,
      mimeType: "text/plain",
    });
    expect(blob?.bytes).toBeInstanceOf(Blob);
    expect(await blob?.bytes.text()).toBe("portable attachment");
    const restoredEntry = await database.importEntries.get(ENTRY_ID);
    expect(new TextDecoder().decode(restoredEntry?.rawBytes ?? new Uint8Array())).toBe(
      "legacy text",
    );

    const safety = await database.meta.get("lastRestoreSafetySnapshot");
    expect(safety?.value).toMatchObject({
      fileName: expect.any(String),
      contentDigest: result.safetySnapshot?.contentDigest,
    });
    const safetyValue = safety?.value as {
      readonly bytes: Uint8Array;
    };
    const safetyArchive = await backup.inspect(safetyValue.bytes);
    expect(safetyArchive.dataset.journals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: JOURNAL_ID }),
        expect.objectContaining({ id: SECOND_JOURNAL_ID }),
      ]),
    );
  });

  it("maps corrupt backup bytes to a stable backup validation error", async () => {
    const backup = service(createDatabase());

    const inspectError = await backup
      .inspect(new TextEncoder().encode("not a zip"))
      .catch((reason: unknown) => reason);
    const restoreError = await backup
      .restore(new TextEncoder().encode("not a zip"), {
        expectedContentDigest: "a".repeat(64),
        replaceExisting: true,
      })
      .catch((reason: unknown) => reason);

    expect(inspectError).toBeInstanceOf(PortError);
    expect((inspectError as PortError).code).toBe("BACKUP_INVALID");
    expect(restoreError).toBeInstanceOf(PortError);
    expect((restoreError as PortError).code).toBe("BACKUP_INVALID");
  });
});

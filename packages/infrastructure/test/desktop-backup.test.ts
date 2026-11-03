import { type BackupDataset, type BackupRestoreOptions } from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { buildBackupArchive, inspectBackupArchive } from "../src/shared/backup/index.js";
import {
  DesktopBackupService,
  type DesktopBackupClient,
  type DesktopBackupRestoreCommand,
} from "../src/desktop/desktop-backup-service.js";
import { DesktopBackupSource } from "../src/desktop/desktop-backup-source.js";
import { DesktopBackupTarget } from "../src/desktop/desktop-backup-target.js";

const DEVICE_ID = parseEntityId("019a3c10-0000-7000-8000-000000000001");
const JOURNAL_ID = parseEntityId("019a3c10-0000-7000-8000-000000000002");
const BLOB_ID = parseEntityId("019a3c10-0000-7000-8000-000000000003");
const ATTACHMENT_ID = parseEntityId("019a3c10-0000-7000-8000-000000000004");
const SESSION_ID = parseEntityId("019a3c10-0000-7000-8000-000000000005");
const ENTRY_ID = parseEntityId("019a3c10-0000-7000-8000-000000000006");
const CREATED_AT = parseUtcTimestamp("2026-11-03T08:00:00.000Z");
const RESTORED_AT = parseUtcTimestamp("2026-11-03T09:00:00.000Z");
const ATTACHMENT_BYTES = new TextEncoder().encode("desktop attachment");
const RAW_IMPORT_BYTES = new TextEncoder().encode("legacy raw import");

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function dataset(): Promise<BackupDataset> {
  const attachmentHash = await sha256Hex(ATTACHMENT_BYTES);
  const rawHash = await sha256Hex(RAW_IMPORT_BYTES);
  return {
    journals: [
      {
        id: JOURNAL_ID,
        journalDate: parseLocalDate("2026-11-03"),
        timezone: "Asia/Shanghai",
        title: "Desktop backup",
        contentJson: JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph" }],
        }),
        contentMarkdown: "Desktop backup",
        contentPlainText: "Desktop backup",
        editorSchemaVersion: 1,
        projectionVersion: 1,
        contentHash: parseContentHash("a".repeat(64)),
        excerpt: "Desktop backup",
        status: "active",
        revision: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        deletedAt: null,
      },
    ],
    journalVersions: [],
    structuredBlocks: [],
    knowledgeItems: [],
    knowledgeLinks: [],
    tasks: [],
    tags: [],
    journalTags: [],
    knowledgeTags: [],
    reports: [],
    importSessions: [
      {
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
      },
    ],
    importEntries: [
      {
        id: ENTRY_ID,
        sessionId: SESSION_ID,
        relativePath: "202611/20261103.txt",
        originalFileName: "20261103.txt",
        detectedDate: parseLocalDate("2026-11-03"),
        encoding: "utf8",
        newlineStyle: "lf",
        fileSha256: rawHash,
        rawSize: RAW_IMPORT_BYTES.byteLength,
        rawCaptureStatus: "captured",
        rawBytes: RAW_IMPORT_BYTES,
        rawCleanedAt: null,
        status: "imported",
        conflictKind: null,
        errorCode: null,
        errorDetail: null,
        journalId: JOURNAL_ID,
        previousJournalRevision: null,
        createdAt: CREATED_AT,
        committedAt: CREATED_AT,
      },
    ],
    attachments: [
      {
        link: {
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
        },
        blob: {
          id: BLOB_ID,
          sha256: attachmentHash,
          byteSize: ATTACHMENT_BYTES.byteLength,
          mimeType: "text/plain",
          createdAt: CREATED_AT,
          orphanedAt: null,
        },
        bytes: ATTACHMENT_BYTES,
      },
    ],
  };
}

function snapshotFor(source: BackupDataset) {
  return {
    deviceId: DEVICE_ID,
    dataSchemaVersion: 1,
    appVersion: "0.1.0",
    journals: source.journals,
    journalVersions: source.journalVersions,
    structuredBlocks: source.structuredBlocks,
    knowledgeItems: source.knowledgeItems,
    knowledgeLinks: source.knowledgeLinks,
    tasks: source.tasks,
    tags: source.tags,
    journalTags: source.journalTags,
    knowledgeTags: source.knowledgeTags,
    reports: source.reports,
    importSessions: source.importSessions,
    importEntries: source.importEntries.map((entry) => {
      const { rawBytes, ...row } = entry;
      return {
        ...row,
        rawBytesBase64:
          rawBytes instanceof Uint8Array ? Buffer.from(rawBytes).toString("base64") : null,
      };
    }),
    attachments: source.attachments.map((record) => ({
      link: record.link,
      blob: record.blob,
      bytesBase64: Buffer.from(record.bytes).toString("base64"),
    })),
  };
}

function fakeClient(overrides: Partial<DesktopBackupClient> = {}): DesktopBackupClient {
  return {
    backupSnapshot: vi.fn(),
    backupReadFile: vi.fn(),
    backupWriteFile: vi.fn(),
    backupRestore: vi.fn(),
    ...overrides,
  };
}

describe("DesktopBackupService", () => {
  it("creates a portable archive from a desktop snapshot", async () => {
    const source = await dataset();
    const client = fakeClient({
      backupSnapshot: vi.fn(async () => snapshotFor(source)),
    });
    const service = new DesktopBackupService({ client });

    const artifact = await service.create({
      fileName: "dailyflow-backup-2026-11-03.zip",
      createdAt: CREATED_AT,
    });
    const inspected = await inspectBackupArchive(artifact.bytes);

    expect(inspected.manifest).toMatchObject({
      deviceId: DEVICE_ID,
      schemaVersion: 1,
      attachmentCount: 1,
      rawImportFileCount: 1,
    });
    expect(inspected.dataset.journals).toEqual([
      expect.objectContaining({ id: JOURNAL_ID, title: "Desktop backup" }),
    ]);
    expect(client.backupSnapshot).toHaveBeenCalledOnce();
  });

  it("verifies the confirmed content digest before invoking desktop restore", async () => {
    const source = await dataset();
    const artifact = await buildBackupArchive({
      dataset: source,
      fileName: "backup.zip",
      createdAt: CREATED_AT,
      deviceId: DEVICE_ID,
      appVersion: "0.1.0",
      dataSchemaVersion: 1,
    });
    const client = fakeClient({
      backupRestore: vi.fn(async () => ({ restoredAt: RESTORED_AT })),
    });
    const service = new DesktopBackupService({ client });

    await expect(
      service.restore(artifact.bytes, {
        expectedContentDigest: "0".repeat(64),
        replaceExisting: true,
      }),
    ).rejects.toMatchObject({ code: "BACKUP_INVALID" });
    expect(client.backupRestore).not.toHaveBeenCalled();
  });

  it("resolves raw import bytes and strips local attachment coordinates", async () => {
    const source = await dataset();
    const artifact = await buildBackupArchive({
      dataset: source,
      fileName: "backup.zip",
      createdAt: CREATED_AT,
      deviceId: DEVICE_ID,
      appVersion: "0.1.0",
      dataSchemaVersion: 1,
    });
    let captured: DesktopBackupRestoreCommand | undefined;
    const client = fakeClient({
      backupRestore: vi.fn(async (command) => {
        captured = command;
        return { restoredAt: RESTORED_AT };
      }),
    });
    const service = new DesktopBackupService({ client });
    const options: BackupRestoreOptions = {
      expectedContentDigest: artifact.manifest.contentDigest,
      replaceExisting: true,
    };

    await service.restore(artifact.bytes, options);

    expect(captured?.expectedContentDigest).toBe(artifact.manifest.contentDigest);
    expect(captured?.dataset.importEntries[0]).toMatchObject({
      id: ENTRY_ID,
      rawBytesBase64: Buffer.from(RAW_IMPORT_BYTES).toString("base64"),
    });
    expect(captured?.dataset.importEntries[0]).not.toHaveProperty("rawBlobPath");
    expect(captured?.attachments[0]?.blob).not.toHaveProperty("storageKind");
    expect(captured?.attachments[0]?.blob).not.toHaveProperty("storageKey");
  });
});

describe("desktop backup file adapters", () => {
  it("reads a selected backup file", async () => {
    const bytesBase64 = Buffer.from([80, 75, 3, 4]).toString("base64");
    const client = fakeClient({
      backupReadFile: vi.fn(async () => ({ bytesBase64 })),
    });
    const source = new DesktopBackupSource({
      client,
      picker: vi.fn(async () => "F:\\backups\\dailyflow.zip"),
    });

    await expect(source.select()).resolves.toEqual({
      filename: "dailyflow.zip",
      bytes: new Uint8Array([80, 75, 3, 4]),
    });
    expect(client.backupReadFile).toHaveBeenCalledWith("F:\\backups\\dailyflow.zip");
  });

  it("preserves a cancelled backup selection", async () => {
    const client = fakeClient();
    const source = new DesktopBackupSource({
      client,
      picker: vi.fn(async () => null),
    });

    await expect(source.select()).resolves.toBeNull();
    expect(client.backupReadFile).not.toHaveBeenCalled();
  });

  it("writes to the selected destination", async () => {
    const client = fakeClient({
      backupWriteFile: vi.fn(async () => ({ bytesWritten: 3 })),
    });
    const target = new DesktopBackupTarget({
      client,
      picker: vi.fn(async () => "/Users/me/Documents/dailyflow.zip"),
    });

    await expect(
      target.save({
        filename: "dailyflow.zip",
        mediaType: "application/zip",
        bytes: new Uint8Array([1, 2, 3]),
        sha256: "a".repeat(64),
        manifest: {} as never,
        files: [],
        totalUncompressedBytes: 3,
      }),
    ).resolves.toEqual({ filename: "dailyflow.zip", bytesWritten: 3 });
    expect(client.backupWriteFile).toHaveBeenCalledWith({
      targetPath: "/Users/me/Documents/dailyflow.zip",
      bytesBase64: Buffer.from([1, 2, 3]).toString("base64"),
      expectedSha256: "a".repeat(64),
    });
  });

  it("preserves a cancelled backup save", async () => {
    const client = fakeClient();
    const target = new DesktopBackupTarget({
      client,
      picker: vi.fn(async () => null),
    });

    await expect(
      target.save({
        filename: "dailyflow.zip",
        mediaType: "application/zip",
        bytes: new Uint8Array([1]),
        sha256: "a".repeat(64),
        manifest: {} as never,
        files: [],
        totalUncompressedBytes: 1,
      }),
    ).resolves.toBeNull();
    expect(client.backupWriteFile).not.toHaveBeenCalled();
  });
});

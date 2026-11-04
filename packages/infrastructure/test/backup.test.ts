import { describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import {
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
} from "@dailyflow/domain";

import {
  BACKUP_ARCHIVE_LIMITS,
  BackupValidationError,
  buildBackupArchive,
  inspectBackupArchive,
} from "../src/shared/backup/index.js";
import type { BackupDataset } from "../src/shared/backup/backup-dataset.js";

const FIXED_TIME = parseUtcTimestamp("2026-11-03T08:00:00.000Z");
const DEVICE_ID = parseEntityId("019a3c10-0000-7000-8000-000000000001");
const JOURNAL_ID = parseEntityId("019a3c10-0000-7000-8000-000000000002");
const BLOB_ID = parseEntityId("019a3c10-0000-7000-8000-000000000003");
const ATTACHMENT_ID = parseEntityId("019a3c10-0000-7000-8000-000000000004");
const SESSION_ID = parseEntityId("019a3c10-0000-7000-8000-000000000005");
const ENTRY_ID = parseEntityId("019a3c10-0000-7000-8000-000000000006");
const VERSION_ID = parseEntityId("019a3c10-0000-7000-8000-000000000007");
const TAG_ID = parseEntityId("019a3c10-0000-7000-8000-000000000008");
const BLOCK_ID = parseEntityId("019a3c10-0000-7000-8000-000000000009");
const ATTACHMENT_HASH = parseContentHash(
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
);
const RAW_IMPORT_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

type MutableBackupDataset = {
  [Key in keyof BackupDataset]: BackupDataset[Key] extends readonly (infer Item)[]
    ? Item[]
    : BackupDataset[Key];
};

function emptyDataset(): MutableBackupDataset {
  return {
    journals: [],
    journalVersions: [],
    structuredBlocks: [],
    knowledgeItems: [],
    knowledgeLinks: [],
    tasks: [],
    tags: [],
    journalTags: [],
    knowledgeTags: [],
    reports: [],
    importSessions: [],
    importEntries: [],
    attachments: [],
  };
}

function populatedDataset(): MutableBackupDataset {
  return {
    ...emptyDataset(),
    journals: [
      {
        id: JOURNAL_ID,
        journalDate: parseLocalDate("2026-11-03"),
        timezone: "Asia/Shanghai",
        title: "备份恢复",
        contentJson: JSON.stringify({ type: "doc", content: [] }),
        editorSchemaVersion: 1,
        contentMarkdown: "",
        contentPlainText: "",
        contentHash: parseContentHash("a".repeat(64)),
        projectionVersion: 1,
        excerpt: "",
        status: "active",
        revision: 1,
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
        deletedAt: null,
      },
    ],
    attachments: [
      {
        link: {
          id: ATTACHMENT_ID,
          blobId: BLOB_ID,
          ownerType: "journal",
          ownerId: JOURNAL_ID,
          displayName: "附件.bin",
          altText: "",
          isInline: false,
          sortOrder: 0,
          createdAt: FIXED_TIME,
          deletedAt: null,
        },
        blob: {
          id: BLOB_ID,
          sha256: ATTACHMENT_HASH,
          byteSize: 3,
          mimeType: "application/octet-stream",
          storageKind: "web-blob",
          storageKey: "local-only-storage-key",
          createdAt: FIXED_TIME,
          orphanedAt: null,
        },
        bytes: new Uint8Array([1, 2, 3]),
      },
    ],
    tags: [
      {
        id: TAG_ID,
        name: "备份",
        nameNormalized: "备份",
        color: null,
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
      },
    ],
    journalTags: [{ journalId: JOURNAL_ID, tagId: TAG_ID }],
    importSessions: [
      {
        id: SESSION_ID,
        rootLabel: "历史日志",
        status: "completed",
        optionsJson: "{}",
        revision: 1,
        scannedCount: 1,
        readyCount: 1,
        importedCount: 1,
        skippedCount: 0,
        conflictCount: 0,
        invalidCount: 0,
        createdAt: FIXED_TIME,
        completedAt: FIXED_TIME,
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
        fileSha256: RAW_IMPORT_HASH,
        rawSize: 5,
        rawCaptureStatus: "captured",
        rawBytes: new TextEncoder().encode("hello"),
        rawCleanedAt: null,
        status: "imported",
        conflictKind: null,
        errorCode: null,
        errorDetail: null,
        journalId: JOURNAL_ID,
        previousJournalRevision: null,
        createdAt: FIXED_TIME,
        committedAt: FIXED_TIME,
      },
    ],
  };
}

function allNdjsonRows(files: readonly { path: string; bytes: Uint8Array }[]): unknown[] {
  const decoder = new TextDecoder();
  return files
    .filter((file) => file.path.startsWith("data/") && file.path.endsWith(".ndjson"))
    .flatMap((file) =>
      decoder
        .decode(file.bytes)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown),
    );
}

function options(dataset = populatedDataset()) {
  return {
    dataset,
    fileName: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
    createdAt: FIXED_TIME,
    deviceId: DEVICE_ID,
    appVersion: "0.1.0",
    dataSchemaVersion: 1,
  };
}

async function replaceArchiveEntry(
  bytes: Uint8Array,
  path: string,
  replacement: Uint8Array,
): Promise<Uint8Array> {
  const entries = unzipSync(bytes);
  entries[path] = replacement;
  return zipSync(entries);
}

async function addArchiveEntry(
  bytes: Uint8Array,
  path: string,
  contents: Uint8Array,
): Promise<Uint8Array> {
  const entries = unzipSync(bytes);
  entries[path] = contents;
  return zipSync(entries);
}

function duplicateCentralDirectoryEntry(bytes: Uint8Array, path: string): Uint8Array {
  const source = bytes.slice();
  const view = new DataView(source.buffer);
  let endOffset = -1;
  for (let offset = source.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error("ZIP end record not found");
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryBytes = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory");
    }
    const fileNameBytes = view.getUint16(offset + 28, true);
    const extraBytes = view.getUint16(offset + 30, true);
    const commentBytes = view.getUint16(offset + 32, true);
    const recordBytes = 46 + fileNameBytes + extraBytes + commentBytes;
    const entryPath = new TextDecoder().decode(
      source.subarray(offset + 46, offset + 46 + fileNameBytes),
    );
    if (entryPath === path) {
      const result = new Uint8Array(source.byteLength + recordBytes);
      result.set(source.subarray(0, endOffset), 0);
      result.set(source.subarray(offset, offset + recordBytes), endOffset);
      result.set(source.subarray(endOffset), endOffset + recordBytes);
      const resultView = new DataView(result.buffer);
      const newEndOffset = endOffset + recordBytes;
      resultView.setUint16(newEndOffset + 8, entryCount + 1, true);
      resultView.setUint16(newEndOffset + 10, entryCount + 1, true);
      resultView.setUint32(newEndOffset + 12, directoryBytes + recordBytes, true);
      return result;
    }
    offset += recordBytes;
  }
  throw new Error(`ZIP entry not found: ${path}`);
}

describe("backup archive", () => {
  it("creates a deterministic portable archive with manifest and checksums", async () => {
    const first = await buildBackupArchive(options());
    const second = await buildBackupArchive(options());

    expect(first.sha256).toBe(second.sha256);
    expect(first.files.map((file) => file.path)).toEqual(second.files.map((file) => file.path));
    expect(first.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "checksums.json",
        "data/journals.ndjson",
        "data/import-entries.ndjson",
        `attachments/03/${ATTACHMENT_HASH}.bin`,
        `imports/raw/2c/${RAW_IMPORT_HASH}.bin`,
      ]),
    );

    const inspected = await inspectBackupArchive(first.bytes);
    expect(inspected.manifest).toMatchObject({
      format: "dailyflow-backup",
      formatVersion: 1,
      schemaVersion: 1,
      dataSchemaVersion: 1,
      appVersion: "0.1.0",
      createdAt: FIXED_TIME,
      deviceId: DEVICE_ID,
      entityCounts: {
        journals: 1,
        importEntries: 1,
      },
      attachmentCount: 1,
      rawImportFileCount: 1,
    });
    expect(allNdjsonRows(inspected.files)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ storageKind: "web-blob" }),
        expect.objectContaining({ storageKey: "local-only-storage-key" }),
      ]),
    );
    expect(inspected.dataset.journalTags).toEqual([{ journalId: JOURNAL_ID, tagId: TAG_ID }]);
  });

  it("rejects a manifest with missing required fields", async () => {
    const archive = await buildBackupArchive(options());
    const manifest = JSON.parse(
      new TextDecoder().decode(archive.files.find((file) => file.path === "manifest.json")?.bytes),
    ) as Record<string, unknown>;
    delete manifest.contentDigest;
    const tampered = await replaceArchiveEntry(
      archive.bytes,
      "manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );

    await expect(inspectBackupArchive(tampered)).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });
  });

  it("rejects a backup created by a newer data schema", async () => {
    const archive = await buildBackupArchive({ ...options(), dataSchemaVersion: 99 });

    await expect(inspectBackupArchive(archive.bytes)).rejects.toMatchObject({
      code: "SCHEMA_TOO_NEW",
    });
  });

  it("rejects duplicate entity ids and duplicate active journal dates", async () => {
    const duplicateIds = populatedDataset();
    duplicateIds.journals.push({ ...duplicateIds.journals[0]! });
    const duplicateDate = populatedDataset();
    duplicateDate.journals.push({
      ...duplicateDate.journals[0]!,
      id: "019a3c10-0000-7000-8000-000000000099",
    });

    await expect(
      inspectBackupArchive((await buildBackupArchive(options(duplicateIds))).bytes),
    ).rejects.toMatchObject({ code: "DUPLICATE_ENTITY_ID" });
    await expect(
      inspectBackupArchive((await buildBackupArchive(options(duplicateDate))).bytes),
    ).rejects.toMatchObject({ code: "DUPLICATE_JOURNAL_DATE" });
  });

  it("rejects invalid foreign keys, invalid JSON fields, and local storage references", async () => {
    const foreignKey = populatedDataset();
    foreignKey.journalVersions.push({
      id: VERSION_ID,
      journalId: "019a3c10-0000-7000-8000-000000000099",
      revision: 1,
      title: "",
      contentJson: JSON.stringify({ type: "doc", content: [] }),
      editorSchemaVersion: 1,
      contentMarkdown: "",
      contentPlainText: "",
      contentHash: "b".repeat(64),
      projectionVersion: 1,
      excerpt: "",
      tagsJson: "[]",
      structuredBlocksJson: "[]",
      searchDocumentsJson: "[]",
      changeSource: "autosave",
      createdAt: FIXED_TIME,
    });

    const invalidJson = populatedDataset();
    invalidJson.journals[0] = {
      ...invalidJson.journals[0]!,
      contentJson: "{broken",
    };

    const unsafeStorage = populatedDataset();
    unsafeStorage.journals[0] = {
      ...unsafeStorage.journals[0]!,
      storageKey: "C:\\Users\\owner\\journal.json",
    };

    await expect(
      inspectBackupArchive((await buildBackupArchive(options(foreignKey))).bytes),
    ).rejects.toMatchObject({ code: "INVALID_FOREIGN_KEY" });
    await expect(
      inspectBackupArchive((await buildBackupArchive(options(invalidJson))).bytes),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(
      inspectBackupArchive((await buildBackupArchive(options(unsafeStorage))).bytes),
    ).rejects.toMatchObject({ code: "UNSAFE_STORAGE_REFERENCE" });
  });

  it("validates cleaned and unavailable raw capture states without fabricating files", async () => {
    const dataset = populatedDataset();
    dataset.importEntries.push(
      {
        ...dataset.importEntries[0]!,
        id: "019a3c10-0000-7000-8000-000000000010",
        relativePath: "202611/20261104.txt",
        originalFileName: "20261104.txt",
        detectedDate: "2026-11-04",
        rawBytes: null,
        rawCaptureStatus: "cleaned",
        rawCleanedAt: FIXED_TIME,
      },
      {
        ...dataset.importEntries[0]!,
        id: "019a3c10-0000-7000-8000-000000000011",
        relativePath: "202611/20261105.txt",
        originalFileName: "20261105.txt",
        detectedDate: "2026-11-05",
        fileSha256: null,
        rawSize: null,
        rawBytes: null,
        rawCaptureStatus: "unavailable",
        status: "failed",
        errorCode: "FILE_READ_FAILED",
        errorDetail: "The source file could not be read.",
      },
    );

    const archive = await buildBackupArchive(options(dataset));
    const inspected = await inspectBackupArchive(archive.bytes);

    expect(inspected.manifest.rawImportFileCount).toBe(1);
    expect(inspected.dataset.importEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawCaptureStatus: "cleaned",
          rawBlobPath: null,
        }),
        expect.objectContaining({
          rawCaptureStatus: "unavailable",
          rawBlobPath: null,
        }),
      ]),
    );
    expect(inspected.files.some((file) => file.path.startsWith("imports/raw/"))).toBe(true);
  });

  it("stores shared raw import bytes once across captured entries", async () => {
    const dataset = populatedDataset();
    dataset.importEntries.push({
      ...dataset.importEntries[0]!,
      id: "019a3c10-0000-7000-8000-000000000012",
      relativePath: "202611/20261104-copy.txt",
      originalFileName: "20261104-copy.txt",
      detectedDate: parseLocalDate("2026-11-04"),
    });

    const archive = await buildBackupArchive(options(dataset));
    const inspected = await inspectBackupArchive(archive.bytes);

    expect(archive.files.filter((file) => file.path.startsWith("imports/raw/"))).toHaveLength(1);
    expect(inspected.manifest.rawImportFileCount).toBe(2);
    expect(inspected.dataset.importEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rawBlobPath: `imports/raw/2c/${RAW_IMPORT_HASH}.bin` }),
        expect.objectContaining({ rawBlobPath: `imports/raw/2c/${RAW_IMPORT_HASH}.bin` }),
      ]),
    );
  });

  it("accepts structured-block attachment owners and rejects task owners", async () => {
    const structuredBlock = populatedDataset();
    structuredBlock.structuredBlocks.push({
      id: BLOCK_ID,
      journalId: JOURNAL_ID,
      blockType: "problem",
      schemaVersion: 1,
      dataJson: "{}",
      sortOrder: 0,
      revision: 1,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
      deletedAt: null,
    });
    structuredBlock.attachments[0] = {
      ...structuredBlock.attachments[0]!,
      link: {
        ...structuredBlock.attachments[0]!.link,
        ownerType: "structured_block",
        ownerId: BLOCK_ID,
      },
    };

    const taskOwner = populatedDataset();
    taskOwner.attachments[0] = {
      ...taskOwner.attachments[0]!,
      link: {
        ...taskOwner.attachments[0]!.link,
        ownerType: "task",
        ownerId: JOURNAL_ID,
      },
    };

    await expect(
      inspectBackupArchive((await buildBackupArchive(options(structuredBlock))).bytes),
    ).resolves.toMatchObject({
      dataset: {
        attachments: [
          {
            link: {
              ownerType: "structured_block",
              ownerId: BLOCK_ID,
            },
          },
        ],
      },
    });
    await expect(
      inspectBackupArchive((await buildBackupArchive(options(taskOwner))).bytes),
    ).rejects.toMatchObject({ code: "INVALID_FOREIGN_KEY" });
  });

  it("rejects inconsistent manifest totals and duplicate checksum paths", async () => {
    const archive = await buildBackupArchive(options());
    const manifest = JSON.parse(
      new TextDecoder().decode(archive.files.find((file) => file.path === "manifest.json")?.bytes),
    ) as Record<string, unknown>;
    manifest.totalBytes = Number(manifest.totalBytes) + 1;
    const wrongTotal = await replaceArchiveEntry(
      archive.bytes,
      "manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );

    const checksums = JSON.parse(
      new TextDecoder().decode(archive.files.find((file) => file.path === "checksums.json")?.bytes),
    ) as { files: Array<Record<string, unknown>> };
    checksums.files.push({ ...checksums.files[0]! });
    const duplicateChecksum = await replaceArchiveEntry(
      archive.bytes,
      "checksums.json",
      new TextEncoder().encode(JSON.stringify(checksums)),
    );

    await expect(inspectBackupArchive(wrongTotal)).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });
    await expect(inspectBackupArchive(duplicateChecksum)).rejects.toMatchObject({
      code: "CHECKSUM_INVALID",
    });
  });

  it("rejects attachment and captured raw-byte hash mismatches", async () => {
    const attachment = populatedDataset();
    attachment.attachments[0] = {
      ...attachment.attachments[0]!,
      bytes: new Uint8Array([9, 9, 9]),
    };
    const raw = populatedDataset();
    raw.importEntries[0] = {
      ...raw.importEntries[0]!,
      rawBytes: new TextEncoder().encode("world"),
    };

    await expect(
      inspectBackupArchive((await buildBackupArchive(options(attachment))).bytes),
    ).rejects.toMatchObject({ code: "ATTACHMENT_HASH_MISMATCH" });
    await expect(
      inspectBackupArchive((await buildBackupArchive(options(raw))).bytes),
    ).rejects.toMatchObject({ code: "RAW_IMPORT_HASH_MISMATCH" });
  });

  it("rejects traversal, UNC, drive-letter, and duplicate archive paths", async () => {
    const archive = await buildBackupArchive(options());
    for (const path of ["../manifest.json", "C:/secret.txt", "\\\\server\\share\\x"]) {
      await expect(
        inspectBackupArchive(await addArchiveEntry(archive.bytes, path, new Uint8Array())),
      ).rejects.toMatchObject({ code: "UNSAFE_ARCHIVE_PATH" });
    }
    await expect(
      inspectBackupArchive(duplicateCentralDirectoryEntry(archive.bytes, "manifest.json")),
    ).rejects.toMatchObject({ code: "DUPLICATE_ARCHIVE_PATH" });
  });

  it("rejects archives that exceed entry-count and byte limits before extraction", async () => {
    const archive = await buildBackupArchive(options());
    await expect(
      inspectBackupArchive(archive.bytes, {
        ...BACKUP_ARCHIVE_LIMITS,
        maxEntries: archive.files.length - 1,
      }),
    ).rejects.toBeInstanceOf(BackupValidationError);
    await expect(
      inspectBackupArchive(archive.bytes, {
        ...BACKUP_ARCHIVE_LIMITS,
        maxTotalUncompressedBytes: 1,
      }),
    ).rejects.toMatchObject({ code: "ARCHIVE_LIMIT_EXCEEDED" });
  });
});

import {
  type BackupArchiveFile,
  type BackupArchiveLimits,
  type BackupArtifact,
  type BackupDataset,
  type BackupManifest,
  type BackupRow,
  type BackupValidationErrorCode,
  type BuildBackupArchiveOptions,
  type InspectedBackup,
} from "@dailyflow/application";
import { stableStringify } from "@dailyflow/shared";
import { unzipSync, zipSync } from "fflate";
import { z } from "zod";

export const BACKUP_SUPPORTED_SCHEMA_VERSION = 1;
export const BACKUP_ARCHIVE_LIMITS: BackupArchiveLimits = {
  maxEntries: 100_000,
  maxFileUncompressedBytes: 512 * 1024 * 1024,
  maxTotalUncompressedBytes: 4 * 1024 * 1024 * 1024,
  maxCompressionRatio: 100,
};

const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_FIXED_TIME = new Date(Date.UTC(1980, 0, 1));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const DATA_FILES = [
  ["journals", "journals"],
  ["journalVersions", "journal-versions"],
  ["structuredBlocks", "structured-blocks"],
  ["knowledgeItems", "knowledge-items"],
  ["knowledgeLinks", "knowledge-links"],
  ["tasks", "tasks"],
  ["tags", "tags"],
  ["journalTags", "journal-tags"],
  ["knowledgeTags", "knowledge-tags"],
  ["reports", "reports"],
  ["importSessions", "import-sessions"],
  ["importEntries", "import-entries"],
] as const;

const DATA_FILE_SET = new Set([
  ...DATA_FILES.map(([, file]) => `data/${file}.ndjson`),
  "data/attachments.ndjson",
]);
const HASH_PATH = /^(?:attachments|imports\/raw)\/[0-9a-f]{2}\/[0-9a-f]{64}\.bin$/u;

const manifestSchema = z
  .object({
    format: z.literal("dailyflow-backup"),
    formatVersion: z.literal(1),
    schemaVersion: z.number().int().positive(),
    dataSchemaVersion: z.number().int().positive(),
    appVersion: z.string().min(1),
    createdAt: z.string().datetime(),
    deviceId: z.string().uuid(),
    entityCounts: z.record(z.number().int().nonnegative()),
    attachmentCount: z.number().int().nonnegative(),
    rawImportFileCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    contentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

const checksumsSchema = z
  .object({
    algorithm: z.literal("sha256"),
    contentDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    files: z.array(
      z
        .object({
          path: z.string().min(1),
          byteSize: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/u),
        })
        .strict(),
    ),
  })
  .strict();

const attachmentRecordSchema = z
  .object({
    link: z.record(z.unknown()),
    blob: z.record(z.unknown()),
  })
  .strict();

export class BackupValidationError extends Error {
  readonly code: BackupValidationErrorCode;

  constructor(code: BackupValidationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BackupValidationError";
    this.code = code;
  }
}

interface CentralDirectoryEntry {
  readonly path: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function encodeText(value: string): Uint8Array {
  return textEncoder.encode(value);
}

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const ownedBytes = bytes.slice();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new BackupValidationError("ARCHIVE_INVALID", "ZIP central directory is truncated");
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new BackupValidationError("ARCHIVE_INVALID", "ZIP central directory is truncated");
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readCentralDirectory(
  bytes: Uint8Array,
  limits: BackupArchiveLimits,
): readonly CentralDirectoryEntry[] {
  if (bytes.byteLength < 22) {
    throw new BackupValidationError("ARCHIVE_INVALID", "Backup is not a valid ZIP archive");
  }

  const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) {
    throw new BackupValidationError(
      "ARCHIVE_INVALID",
      "ZIP end-of-central-directory record is missing",
    );
  }

  const entryCount = readUint16(bytes, endOffset + 10);
  const directoryBytes = readUint32(bytes, endOffset + 12);
  const directoryOffset = readUint32(bytes, endOffset + 16);
  if (entryCount === 0xffff || directoryBytes === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new BackupValidationError(
      "ARCHIVE_LIMIT_EXCEEDED",
      "ZIP64 backups are not accepted by DailyFlow V1",
    );
  }
  if (entryCount > limits.maxEntries) {
    throw new BackupValidationError(
      "ARCHIVE_LIMIT_EXCEEDED",
      `Backup contains ${entryCount} entries; limit is ${limits.maxEntries}`,
    );
  }
  if (directoryOffset + directoryBytes > endOffset) {
    throw new BackupValidationError("ARCHIVE_INVALID", "ZIP central directory is out of range");
  }

  const entries: CentralDirectoryEntry[] = [];
  let offset = directoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, offset) !== ZIP_CENTRAL_FILE) {
      throw new BackupValidationError(
        "ARCHIVE_INVALID",
        "ZIP central directory contains an invalid record",
      );
    }
    const compressionMethod = readUint16(bytes, offset + 10);
    const compressedBytes = readUint32(bytes, offset + 20);
    const uncompressedBytes = readUint32(bytes, offset + 24);
    const fileNameBytes = readUint16(bytes, offset + 28);
    const extraBytes = readUint16(bytes, offset + 30);
    const commentBytes = readUint16(bytes, offset + 32);
    const recordBytes = 46 + fileNameBytes + extraBytes + commentBytes;
    if (offset + recordBytes > endOffset) {
      throw new BackupValidationError(
        "ARCHIVE_INVALID",
        "ZIP central directory record is truncated",
      );
    }

    let path: string;
    try {
      path = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameBytes));
    } catch (error) {
      throw new BackupValidationError("ARCHIVE_INVALID", "ZIP entry name is not UTF-8", {
        cause: error,
      });
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new BackupValidationError(
        "ARCHIVE_INVALID",
        `Unsupported ZIP compression method ${compressionMethod}`,
      );
    }
    if (uncompressedBytes > limits.maxFileUncompressedBytes) {
      throw new BackupValidationError(
        "ARCHIVE_LIMIT_EXCEEDED",
        `Backup entry ${path} exceeds the per-file size limit`,
      );
    }
    totalUncompressedBytes += uncompressedBytes;
    if (
      totalUncompressedBytes > limits.maxTotalUncompressedBytes ||
      (uncompressedBytes > 1024 * 1024 &&
        (compressedBytes === 0 || uncompressedBytes / compressedBytes > limits.maxCompressionRatio))
    ) {
      throw new BackupValidationError(
        "ARCHIVE_LIMIT_EXCEEDED",
        "Backup exceeds the configured extraction limits",
      );
    }

    entries.push({ path, compressedBytes, uncompressedBytes });
    offset += recordBytes;
  }

  return entries;
}

function assertSafePath(path: string): void {
  const segments = path.split("/");
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    /^[a-zA-Z]:/u.test(path) ||
    path.startsWith("//") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new BackupValidationError(
      "UNSAFE_ARCHIVE_PATH",
      `Backup contains an unsafe path: ${JSON.stringify(path)}`,
    );
  }
}

function assertWhitelistedPath(path: string): void {
  if (
    path !== "manifest.json" &&
    path !== "checksums.json" &&
    !DATA_FILE_SET.has(path) &&
    !HASH_PATH.test(path)
  ) {
    throw new BackupValidationError(
      "UNSAFE_ARCHIVE_PATH",
      `Backup contains an unsupported entry: ${path}`,
    );
  }
}

function assertNoUnsafeStorageReference(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeStorageReference(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:storageKey|storagePath|absolutePath|localPath)$/iu.test(key)) {
      throw new BackupValidationError(
        "UNSAFE_STORAGE_REFERENCE",
        `Backup data contains a local storage reference at ${path}.${key}`,
      );
    }
    assertNoUnsafeStorageReference(child, `${path}.${key}`);
  }
}

function ndjsonBytes(rows: readonly BackupRow[]): Uint8Array {
  const lines = [...rows]
    .sort((left, right) => compareText(backupRowKey(left), backupRowKey(right)))
    .map((row) => stableStringify(row));
  return encodeText(lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

function backupRowKey(row: BackupRow): string {
  return typeof row.id === "string" && row.id.length > 0
    ? `id:${row.id}`
    : `row:${stableStringify(row)}`;
}

function attachmentPath(sha256: string): string {
  return `attachments/${sha256.slice(0, 2)}/${sha256}.bin`;
}

function rawImportPath(sha256: string): string {
  return `imports/raw/${sha256.slice(0, 2)}/${sha256}.bin`;
}

function asString(row: BackupRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function portableAttachmentBlob(blob: BackupRow): BackupRow {
  const portableBlob = { ...blob };
  delete portableBlob.storageKey;
  delete portableBlob.storageKind;
  return portableBlob;
}

function normalizeImportEntries(dataset: BackupDataset): readonly BackupRow[] {
  return dataset.importEntries.map((entry) => {
    const rawCaptureStatus = asString(entry, "rawCaptureStatus");
    const rawBytes = entry.rawBytes;
    const fileSha256 = asString(entry, "fileSha256");
    const rawBlobPath =
      rawCaptureStatus === "captured" && rawBytes instanceof Uint8Array && fileSha256 !== null
        ? rawImportPath(fileSha256)
        : null;
    const portableEntry = { ...entry };
    delete portableEntry.rawBytes;
    return { ...portableEntry, rawBlobPath };
  });
}

function countImportRawFiles(dataset: BackupDataset): number {
  return dataset.importEntries.filter(
    (entry) =>
      entry.rawCaptureStatus === "captured" &&
      entry.rawBytes instanceof Uint8Array &&
      typeof entry.fileSha256 === "string",
  ).length;
}

async function fileRecord(path: string, bytes: Uint8Array): Promise<BackupArchiveFile> {
  return {
    path,
    bytes,
    byteSize: bytes.byteLength,
    sha256: await sha256BytesHex(bytes),
  };
}

async function appendContentFile(
  files: BackupArchiveFile[],
  paths: Set<string>,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (paths.has(path)) {
    return;
  }
  files.push(await fileRecord(path, bytes));
  paths.add(path);
}

async function archiveContentDigest(files: readonly BackupArchiveFile[]): Promise<string> {
  const content = files
    .filter((file) => file.path !== "manifest.json" && file.path !== "checksums.json")
    .map((file) => ({ path: file.path, byteSize: file.byteSize, sha256: file.sha256 }));
  return sha256BytesHex(encodeText(stableStringify(content)));
}

async function archiveBytes(files: readonly BackupArchiveFile[]): Promise<Uint8Array> {
  const entries: Record<
    string,
    [Uint8Array, { mtime: Date; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]
  > = {};
  for (const file of files) {
    entries[file.path] = [file.bytes, { mtime: ZIP_FIXED_TIME, level: 6 }];
  }
  return zipSync(entries);
}

export async function buildBackupArchive(
  input: BuildBackupArchiveOptions,
): Promise<BackupArtifact> {
  const normalizedImports = normalizeImportEntries(input.dataset);
  const dataRows: Record<(typeof DATA_FILES)[number][0], readonly BackupRow[]> = {
    journals: input.dataset.journals,
    journalVersions: input.dataset.journalVersions,
    structuredBlocks: input.dataset.structuredBlocks,
    knowledgeItems: input.dataset.knowledgeItems,
    knowledgeLinks: input.dataset.knowledgeLinks,
    tasks: input.dataset.tasks,
    tags: input.dataset.tags,
    journalTags: input.dataset.journalTags,
    knowledgeTags: input.dataset.knowledgeTags,
    reports: input.dataset.reports,
    importSessions: input.dataset.importSessions,
    importEntries: normalizedImports,
  };
  const files: BackupArchiveFile[] = [];
  for (const [key, file] of DATA_FILES) {
    files.push(await fileRecord(`data/${file}.ndjson`, ndjsonBytes(dataRows[key])));
  }
  files.push(
    await fileRecord(
      "data/attachments.ndjson",
      ndjsonBytes(
        input.dataset.attachments.map((record) => ({
          link: record.link,
          blob: portableAttachmentBlob(record.blob),
        })),
      ),
    ),
  );
  const contentFilePaths = new Set<string>();
  for (const record of input.dataset.attachments) {
    const sha256 = asString(record.blob, "sha256");
    if (sha256 !== null) {
      await appendContentFile(files, contentFilePaths, attachmentPath(sha256), record.bytes);
    }
  }
  for (const entry of input.dataset.importEntries) {
    if (
      entry.rawCaptureStatus === "captured" &&
      entry.rawBytes instanceof Uint8Array &&
      typeof entry.fileSha256 === "string"
    ) {
      await appendContentFile(
        files,
        contentFilePaths,
        rawImportPath(entry.fileSha256),
        entry.rawBytes,
      );
    }
  }

  files.sort((left, right) => compareText(left.path, right.path));
  const contentDigest = await archiveContentDigest(files);
  const entityCounts = Object.fromEntries(DATA_FILES.map(([key]) => [key, dataRows[key].length]));
  const manifest: BackupManifest = {
    format: "dailyflow-backup",
    formatVersion: 1,
    schemaVersion: input.dataSchemaVersion,
    dataSchemaVersion: input.dataSchemaVersion,
    appVersion: input.appVersion,
    createdAt: input.createdAt,
    deviceId: input.deviceId,
    entityCounts: { ...entityCounts, attachments: input.dataset.attachments.length },
    attachmentCount: input.dataset.attachments.length,
    rawImportFileCount: countImportRawFiles(input.dataset),
    totalBytes: files.reduce((total, file) => total + file.byteSize, 0),
    contentDigest,
  };
  const checksums = await fileRecord(
    "checksums.json",
    encodeText(
      `${stableStringify({
        algorithm: "sha256",
        contentDigest,
        files: files.map(({ path, byteSize, sha256 }) => ({ path, byteSize, sha256 })),
      })}\n`,
    ),
  );
  const manifestFile = await fileRecord(
    "manifest.json",
    encodeText(`${stableStringify(manifest)}\n`),
  );
  const orderedFiles = [...files, checksums, manifestFile].sort((left, right) =>
    compareText(left.path, right.path),
  );
  const bytes = await archiveBytes(orderedFiles);

  return {
    filename: input.fileName,
    mediaType: "application/zip",
    bytes,
    sha256: await sha256BytesHex(bytes),
    manifest,
    files: orderedFiles,
    totalUncompressedBytes: orderedFiles.reduce((total, file) => total + file.byteSize, 0),
  };
}

function parseNdjson(bytes: Uint8Array, path: string): BackupRow[] {
  let text: string;
  try {
    text = textDecoder.decode(bytes);
  } catch (error) {
    throw new BackupValidationError("INVALID_JSON", `${path} is not valid UTF-8`, {
      cause: error,
    });
  }
  if (text.trim().length === 0) {
    return [];
  }
  return text
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new BackupValidationError(
          "INVALID_JSON",
          `${path} contains invalid JSON on line ${index + 1}`,
          { cause: error },
        );
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new BackupValidationError(
          "INVALID_JSON",
          `${path} line ${index + 1} must be a JSON object`,
        );
      }
      return value as BackupRow;
    });
}

function requireRowId(row: BackupRow, file: string): string {
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new BackupValidationError("INVALID_JSON", `${file} contains a row without an id`);
  }
  return row.id;
}

function assertUniqueIds(rows: readonly BackupRow[], file: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = requireRowId(row, file);
    if (ids.has(id)) {
      throw new BackupValidationError("DUPLICATE_ENTITY_ID", `${file} contains duplicate id ${id}`);
    }
    ids.add(id);
  }
}

function assertUniqueRelationRows(rows: readonly BackupRow[], file: string): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = stableStringify(row);
    if (keys.has(key)) {
      throw new BackupValidationError(
        "DUPLICATE_ENTITY_ID",
        `${file} contains a duplicate relation row`,
      );
    }
    keys.add(key);
  }
}

function assertUniqueActiveJournalDates(journals: readonly BackupRow[]): void {
  const dates = new Set<string>();
  for (const journal of journals) {
    if (journal.deletedAt !== null) {
      continue;
    }
    const date = asString(journal, "journalDate");
    if (date === null) {
      throw new BackupValidationError("INVALID_JSON", "Journal is missing journalDate");
    }
    if (dates.has(date)) {
      throw new BackupValidationError(
        "DUPLICATE_JOURNAL_DATE",
        `More than one active journal uses date ${date}`,
      );
    }
    dates.add(date);
  }
}

function assertJsonFields(rows: readonly BackupRow[], keys: readonly string[], file: string): void {
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value !== "string" || value.length === 0) {
        continue;
      }
      try {
        JSON.parse(value);
      } catch (error) {
        throw new BackupValidationError(
          "INVALID_JSON",
          `${file}.${key} is not valid JSON for ${String(row.id)}`,
          { cause: error },
        );
      }
    }
  }
}

function foreignKey(
  row: BackupRow,
  key: string,
  ids: ReadonlySet<string>,
  allowedNull: boolean,
): void {
  const value = row[key];
  if (value === null && allowedNull) {
    return;
  }
  if (typeof value !== "string" || !ids.has(value)) {
    throw new BackupValidationError(
      "INVALID_FOREIGN_KEY",
      `Invalid ${key} reference ${JSON.stringify(value)} on ${String(row.id)}`,
    );
  }
}

function validateRelations(dataset: BackupDataset): void {
  const journalIds = new Set(dataset.journals.map((row) => requireRowId(row, "journals")));
  const versionIds = new Set(
    dataset.journalVersions.map((row) => requireRowId(row, "journal-versions")),
  );
  const blockIds = new Set(
    dataset.structuredBlocks.map((row) => requireRowId(row, "structured-blocks")),
  );
  const knowledgeIds = new Set(
    dataset.knowledgeItems.map((row) => requireRowId(row, "knowledge-items")),
  );
  const tagIds = new Set(dataset.tags.map((row) => requireRowId(row, "tags")));
  const sessionIds = new Set(
    dataset.importSessions.map((row) => requireRowId(row, "import-sessions")),
  );
  const blobIds = new Set(
    dataset.attachments.map((record) => requireRowId(record.blob, "attachments.blob")),
  );

  for (const row of dataset.journalVersions) {
    foreignKey(row, "journalId", journalIds, false);
  }
  for (const row of dataset.structuredBlocks) {
    foreignKey(row, "journalId", journalIds, false);
  }
  for (const row of dataset.knowledgeItems) {
    foreignKey(row, "sourceJournalId", journalIds, true);
    foreignKey(row, "sourceBlockId", blockIds, true);
  }
  for (const row of dataset.knowledgeLinks) {
    foreignKey(row, "sourceItemId", knowledgeIds, false);
    foreignKey(row, "targetItemId", knowledgeIds, false);
  }
  for (const row of dataset.tasks) {
    foreignKey(row, "journalId", journalIds, true);
    foreignKey(row, "knowledgeItemId", knowledgeIds, true);
  }
  for (const row of dataset.journalTags) {
    foreignKey(row, "journalId", journalIds, false);
    foreignKey(row, "tagId", tagIds, false);
  }
  for (const row of dataset.knowledgeTags) {
    foreignKey(row, "knowledgeItemId", knowledgeIds, false);
    foreignKey(row, "tagId", tagIds, false);
  }
  for (const record of dataset.attachments) {
    if (!blobIds.has(String(record.link.blobId))) {
      throw new BackupValidationError(
        "INVALID_FOREIGN_KEY",
        `Attachment ${record.link.id} references missing blob ${String(record.link.blobId)}`,
      );
    }
    const ownerType = record.link.ownerType;
    const ownerId = record.link.ownerId;
    const ownerIds =
      ownerType === "journal"
        ? journalIds
        : ownerType === "knowledge_item"
          ? knowledgeIds
          : ownerType === "structured_block"
            ? blockIds
            : null;
    if (ownerIds === null || typeof ownerId !== "string" || !ownerIds.has(ownerId)) {
      throw new BackupValidationError(
        "INVALID_FOREIGN_KEY",
        `Attachment ${record.link.id} has an invalid owner reference`,
      );
    }
  }
  for (const row of dataset.importEntries) {
    foreignKey(row, "sessionId", sessionIds, false);
    foreignKey(row, "journalId", journalIds, true);
  }

  void versionIds;
}

async function validateImportEntries(
  entries: readonly BackupRow[],
  files: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const referencedPaths = new Set<string>();
  for (const entry of entries) {
    const status = entry.rawCaptureStatus;
    const hash = entry.fileSha256;
    const size = entry.rawSize;
    const rawPath = entry.rawBlobPath;
    if (status === "captured") {
      if (
        typeof hash !== "string" ||
        !/^[0-9a-f]{64}$/u.test(hash) ||
        !Number.isInteger(size) ||
        typeof rawPath !== "string" ||
        rawPath !== rawImportPath(hash)
      ) {
        throw new BackupValidationError(
          "RAW_IMPORT_INVALID",
          `Captured import ${entry.id} has inconsistent hash, size, or blob path`,
        );
      }
      const bytes = files.get(rawPath);
      if (
        bytes === undefined ||
        bytes.byteLength !== size ||
        (await sha256BytesHex(bytes)) !== hash
      ) {
        throw new BackupValidationError(
          "RAW_IMPORT_HASH_MISMATCH",
          `Captured import ${entry.id} does not match its raw bytes`,
        );
      }
      referencedPaths.add(rawPath);
      continue;
    }

    if (rawPath !== null) {
      throw new BackupValidationError(
        "RAW_IMPORT_INVALID",
        `${status} import ${entry.id} must not reference a raw byte file`,
      );
    }
    if (status === "cleaned") {
      if (
        typeof entry.rawCleanedAt !== "string" ||
        typeof hash !== "string" ||
        !Number.isInteger(size)
      ) {
        throw new BackupValidationError(
          "RAW_IMPORT_INVALID",
          `Cleaned import ${entry.id} must retain its hash, size, and cleanup timestamp`,
        );
      }
      continue;
    }
    if (
      status === "unavailable" &&
      typeof entry.errorDetail === "string" &&
      entry.errorDetail.length > 0 &&
      hash === null &&
      size === null
    ) {
      continue;
    }
    throw new BackupValidationError(
      "RAW_IMPORT_INVALID",
      `Import ${entry.id} has an invalid raw capture state`,
    );
  }

  for (const path of files.keys()) {
    if (path.startsWith("imports/raw/") && !referencedPaths.has(path)) {
      throw new BackupValidationError(
        "RAW_IMPORT_INVALID",
        `Raw import file ${path} is not referenced`,
      );
    }
  }
}

async function validateAttachments(
  records: readonly BackupDataset["attachments"][number][],
  files: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  const referencedPaths = new Set<string>();
  for (const record of records) {
    const sha256 = record.blob.sha256;
    const byteSize = record.blob.byteSize;
    if (
      typeof sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(sha256) ||
      !Number.isInteger(byteSize) ||
      record.bytes.byteLength !== byteSize
    ) {
      throw new BackupValidationError(
        "ATTACHMENT_INVALID",
        `Attachment ${record.link.id} has inconsistent metadata`,
      );
    }
    const path = attachmentPath(sha256);
    const bytes = files.get(path);
    if (bytes === undefined || (await sha256BytesHex(bytes)) !== sha256) {
      throw new BackupValidationError(
        "ATTACHMENT_HASH_MISMATCH",
        `Attachment ${record.link.id} does not match its content hash`,
      );
    }
    referencedPaths.add(path);
  }
  for (const path of files.keys()) {
    if (path.startsWith("attachments/") && !referencedPaths.has(path)) {
      throw new BackupValidationError(
        "ATTACHMENT_INVALID",
        `Attachment file ${path} is not referenced`,
      );
    }
  }
}

async function parseDataset(files: ReadonlyMap<string, Uint8Array>): Promise<BackupDataset> {
  const read = (file: string, uniqueness: "id" | "relation" = "id"): BackupRow[] => {
    const bytes = files.get(`data/${file}.ndjson`);
    if (bytes === undefined) {
      throw new BackupValidationError(
        "ARCHIVE_ENTRY_MISSING",
        `Required backup entry data/${file}.ndjson is missing`,
      );
    }
    const rows = parseNdjson(bytes, `data/${file}.ndjson`);
    if (uniqueness === "id") {
      assertUniqueIds(rows, file);
    } else {
      assertUniqueRelationRows(rows, file);
    }
    return rows;
  };

  const journals = read("journals");
  const journalVersions = read("journal-versions");
  const structuredBlocks = read("structured-blocks");
  const knowledgeItems = read("knowledge-items");
  const knowledgeLinks = read("knowledge-links");
  const tasks = read("tasks");
  const tags = read("tags");
  const journalTags = read("journal-tags", "relation");
  const knowledgeTags = read("knowledge-tags", "relation");
  const reports = read("reports");
  const importSessions = read("import-sessions");
  const importEntries = read("import-entries");

  assertUniqueActiveJournalDates(journals);
  assertJsonFields(journals, ["contentJson"], "journals");
  assertJsonFields(
    journalVersions,
    ["contentJson", "tagsJson", "structuredBlocksJson", "searchDocumentsJson"],
    "journal-versions",
  );
  assertJsonFields(structuredBlocks, ["dataJson"], "structured-blocks");
  assertJsonFields(knowledgeItems, ["contentJson"], "knowledge-items");
  assertJsonFields(tasks, ["descriptionJson"], "tasks");
  assertJsonFields(importSessions, ["optionsJson"], "import-sessions");
  assertJsonFields(reports, ["contentJson", "statsJson"], "reports");

  const attachmentBytes = files.get("data/attachments.ndjson");
  if (attachmentBytes === undefined) {
    throw new BackupValidationError(
      "ARCHIVE_ENTRY_MISSING",
      "Required backup entry data/attachments.ndjson is missing",
    );
  }
  const attachments = parseNdjson(attachmentBytes, "data/attachments.ndjson").map((row) => {
    const parsed = attachmentRecordSchema.parse(row);
    if (typeof parsed.link.id !== "string" || typeof parsed.blob.id !== "string") {
      throw new BackupValidationError(
        "ATTACHMENT_INVALID",
        "Attachment link and blob must both have ids",
      );
    }
    const sha256 = parsed.blob.sha256;
    if (typeof sha256 !== "string") {
      throw new BackupValidationError("ATTACHMENT_INVALID", "Attachment blob is missing sha256");
    }
    const bytes = files.get(attachmentPath(sha256));
    if (bytes === undefined) {
      throw new BackupValidationError(
        "ARCHIVE_ENTRY_MISSING",
        `Attachment bytes are missing for ${parsed.link.id}`,
      );
    }
    return {
      link: parsed.link as BackupRow,
      blob: parsed.blob as BackupRow,
      bytes,
    };
  });
  const dataset: BackupDataset = {
    journals,
    journalVersions,
    structuredBlocks,
    knowledgeItems,
    knowledgeLinks,
    tasks,
    tags,
    journalTags,
    knowledgeTags,
    reports,
    importSessions,
    importEntries,
    attachments,
  };
  validateRelations(dataset);
  await validateAttachments(attachments, files);
  await validateImportEntries(importEntries, files);
  return dataset;
}

export async function inspectBackupArchive(
  bytes: Uint8Array,
  limits: BackupArchiveLimits = BACKUP_ARCHIVE_LIMITS,
): Promise<InspectedBackup> {
  const directory = readCentralDirectory(bytes, limits);
  const seenPaths = new Set<string>();
  for (const entry of directory) {
    assertSafePath(entry.path);
    assertWhitelistedPath(entry.path);
    const normalized = entry.path.toLocaleLowerCase("en-US");
    if (seenPaths.has(normalized)) {
      throw new BackupValidationError(
        "DUPLICATE_ARCHIVE_PATH",
        `Backup contains duplicate path ${entry.path}`,
      );
    }
    seenPaths.add(normalized);
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    throw new BackupValidationError("ARCHIVE_INVALID", "Backup ZIP could not be extracted", {
      cause: error,
    });
  }
  const files = new Map(
    directory.map((entry) => {
      const contents = unzipped[entry.path];
      if (contents === undefined) {
        throw new BackupValidationError(
          "ARCHIVE_ENTRY_MISSING",
          `Backup entry ${entry.path} could not be read`,
        );
      }
      if (contents.byteLength !== entry.uncompressedBytes) {
        throw new BackupValidationError(
          "ARCHIVE_INVALID",
          `Backup entry ${entry.path} has an inconsistent uncompressed size`,
        );
      }
      return [entry.path, contents] as const;
    }),
  );

  const manifestBytes = files.get("manifest.json");
  const checksumsBytes = files.get("checksums.json");
  if (manifestBytes === undefined || checksumsBytes === undefined) {
    throw new BackupValidationError(
      "ARCHIVE_ENTRY_MISSING",
      "Backup must contain manifest.json and checksums.json",
    );
  }

  let manifest: BackupManifest;
  let checksums: z.infer<typeof checksumsSchema>;
  try {
    manifest = manifestSchema.parse(
      JSON.parse(textDecoder.decode(manifestBytes)),
    ) as BackupManifest;
    checksums = checksumsSchema.parse(JSON.parse(textDecoder.decode(checksumsBytes)));
  } catch (error) {
    throw new BackupValidationError(
      "MANIFEST_INVALID",
      "Backup manifest or checksums do not match the required schema",
      { cause: error },
    );
  }
  if (
    manifest.schemaVersion > BACKUP_SUPPORTED_SCHEMA_VERSION ||
    manifest.dataSchemaVersion > BACKUP_SUPPORTED_SCHEMA_VERSION
  ) {
    throw new BackupValidationError(
      "SCHEMA_TOO_NEW",
      `Backup schema ${Math.max(manifest.schemaVersion, manifest.dataSchemaVersion)} is newer than supported schema ${BACKUP_SUPPORTED_SCHEMA_VERSION}`,
    );
  }

  const records: BackupArchiveFile[] = [];
  for (const [path, contents] of files) {
    if (path === "manifest.json" || path === "checksums.json") {
      continue;
    }
    records.push(await fileRecord(path, contents));
  }
  records.sort((left, right) => compareText(left.path, right.path));
  const checksumPaths = new Set<string>();
  for (const checksum of checksums.files) {
    const normalizedPath = checksum.path.toLocaleLowerCase("en-US");
    if (checksumPaths.has(normalizedPath)) {
      throw new BackupValidationError(
        "CHECKSUM_INVALID",
        `Checksums contain duplicate path ${checksum.path}`,
      );
    }
    checksumPaths.add(normalizedPath);
  }
  const expected = new Map(checksums.files.map((file) => [file.path, file]));
  for (const record of records) {
    const checksum = expected.get(record.path);
    if (
      checksum === undefined ||
      checksum.byteSize !== record.byteSize ||
      checksum.sha256 !== record.sha256
    ) {
      throw new BackupValidationError(
        "CHECKSUM_INVALID",
        `Checksum does not match backup entry ${record.path}`,
      );
    }
    expected.delete(record.path);
  }
  if (expected.size > 0) {
    throw new BackupValidationError(
      "CHECKSUM_INVALID",
      `Checksums reference missing backup entries: ${[...expected.keys()].join(", ")}`,
    );
  }
  const contentDigest = await archiveContentDigest(records);
  if (checksums.contentDigest !== contentDigest || manifest.contentDigest !== contentDigest) {
    throw new BackupValidationError(
      "CHECKSUM_INVALID",
      "Backup content digest does not match the manifest",
    );
  }

  const dataset = await parseDataset(files);
  const actualEntityCounts: Record<string, number> = {
    journals: dataset.journals.length,
    journalVersions: dataset.journalVersions.length,
    structuredBlocks: dataset.structuredBlocks.length,
    knowledgeItems: dataset.knowledgeItems.length,
    knowledgeLinks: dataset.knowledgeLinks.length,
    tasks: dataset.tasks.length,
    tags: dataset.tags.length,
    journalTags: dataset.journalTags.length,
    knowledgeTags: dataset.knowledgeTags.length,
    reports: dataset.reports.length,
    importSessions: dataset.importSessions.length,
    importEntries: dataset.importEntries.length,
    attachments: dataset.attachments.length,
  };
  if (
    Object.entries(actualEntityCounts).some(
      ([key, value]) => manifest.entityCounts[key] !== value,
    ) ||
    manifest.attachmentCount !== dataset.attachments.length ||
    manifest.rawImportFileCount !==
      dataset.importEntries.filter((entry) => entry.rawCaptureStatus === "captured").length ||
    manifest.totalBytes !== records.reduce((total, file) => total + file.byteSize, 0)
  ) {
    throw new BackupValidationError(
      "MANIFEST_INVALID",
      "Manifest entity counts do not match backup data",
    );
  }
  assertNoUnsafeStorageReference(dataset);

  const [manifestFile, checksumsFile] = await Promise.all([
    fileRecord("manifest.json", manifestBytes),
    fileRecord("checksums.json", checksumsBytes),
  ]);
  return { manifest, dataset, files: [manifestFile, checksumsFile, ...records] };
}

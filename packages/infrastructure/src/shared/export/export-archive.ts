import type {
  ContentProjector,
  ExportArtifact,
  ExportDataset,
  ExportFile,
  ExportFileManifestEntry,
  ExportManifest,
  ExportOptions,
} from "@dailyflow/application";
import type { UtcTimestamp } from "@dailyflow/domain";
import { stableStringify } from "@dailyflow/shared";
import { zipSync } from "fflate";

const textEncoder = new TextEncoder();
export const EXPORT_ZIP_TIME = new Date("1980-01-01T00:00:00.000Z");
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export interface ExportArchiveBundle {
  readonly files: readonly ExportFile[];
  readonly manifest: ExportManifest;
  readonly sha256: string;
  readonly totalUncompressedBytes: number;
}

export interface BuildExportArchiveOptions {
  readonly dataset: ExportDataset;
  readonly projector: ContentProjector;
  readonly options?: Partial<Omit<ExportOptions, "scope">> & {
    readonly scope?: ExportOptions["scope"];
  };
  readonly generatedAt: UtcTimestamp;
}

function exportEnabled(
  scope: ExportOptions["scope"],
  target: Exclude<ExportOptions["scope"], "all">,
): boolean {
  return scope === "all" || scope === target;
}

export function sanitizeExportFileName(input: string, fallback = "untitled"): string {
  let value = input
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- Filesystem names must not contain control characters.
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.\s]+$/gu, "");

  if (value.length === 0) {
    value = fallback;
  }
  if (WINDOWS_RESERVED_NAME.test(value)) {
    value = `_${value}`;
  }

  const characters = Array.from(value);
  if (characters.length > 160) {
    value = characters
      .slice(0, 160)
      .join("")
      .replace(/[.\s]+$/gu, "");
  }

  return value.length === 0 ? fallback : value;
}

function uniquePaths(
  entries: readonly {
    readonly basePath: string;
    readonly id: string;
    readonly bytes: Uint8Array;
  }[],
): ExportFile[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.basePath.toLocaleLowerCase("en-US");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const usedPaths = new Set<string>();
  const appendSuffix = (path: string, suffix: string): string =>
    path.replace(/(\.[^.]*)?$/u, `-${suffix}$1`);

  return entries.map((entry) => {
    const collision = (counts.get(entry.basePath.toLocaleLowerCase("en-US")) ?? 0) > 1;
    let path = collision ? appendSuffix(entry.basePath, entry.id.slice(-8)) : entry.basePath;
    if (usedPaths.has(path.toLocaleLowerCase("en-US"))) {
      path = appendSuffix(entry.basePath, entry.id);
    }
    const pathKey = path.toLocaleLowerCase("en-US");
    if (usedPaths.has(pathKey)) {
      throw new Error(`Export path collision remains after disambiguation: ${path}`);
    }
    usedPaths.add(pathKey);
    return { path, bytes: entry.bytes };
  });
}

function encodeText(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function markdownDocument(input: {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly localDate?: string;
  readonly revision: number;
  readonly tags: readonly string[];
  readonly rendered: string;
}): string {
  return [
    "---",
    `id: ${JSON.stringify(input.id)}`,
    `type: ${JSON.stringify(input.kind)}`,
    ...(input.localDate === undefined ? [] : [`date: ${JSON.stringify(input.localDate)}`]),
    `title: ${JSON.stringify(input.title)}`,
    `revision: ${input.revision}`,
    `tags: ${JSON.stringify(input.tags)}`,
    "---",
    "",
    `# ${input.title}`,
    "",
    input.rendered.trimEnd(),
    "",
  ].join("\n");
}

interface NdjsonEntityLine {
  readonly entityType: string;
  readonly id: string;
  readonly line: string;
}

function ndjsonLine(input: {
  readonly entityType: string;
  readonly id: string;
  readonly deletedAt: string | null;
  readonly data: unknown;
}): NdjsonEntityLine {
  return {
    entityType: input.entityType,
    id: input.id,
    line: `{"entityType":${JSON.stringify(input.entityType)},"schemaVersion":1,"id":${JSON.stringify(
      input.id,
    )},"deletedAt":${JSON.stringify(input.deletedAt)},"data":${stableStringify(input.data)}}`,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function ndjsonFile(lines: readonly NdjsonEntityLine[]): Uint8Array {
  const ordered = [...lines].sort(
    (left, right) =>
      compareText(left.entityType, right.entityType) || compareText(left.id, right.id),
  );
  return encodeText(
    ordered.length === 0 ? "" : `${ordered.map((entry) => entry.line).join("\n")}\n`,
  );
}

function selected<T>(
  records: readonly T[],
  includeDeleted: boolean,
  deletedAt: (item: T) => string | null,
): readonly T[] {
  return includeDeleted ? records : records.filter((record) => deletedAt(record) === null);
}

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const ownedBytes = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildExportArchive(
  input: BuildExportArchiveOptions,
): Promise<ExportArchiveBundle> {
  const scope = input.options?.scope ?? "all";
  const includeDeleted = input.options?.includeDeleted ?? false;
  const includeAttachments = input.options?.includeAttachments ?? true;
  const includeImportRawBytes = input.options?.includeImportRawBytes ?? true;
  const dataset = input.dataset;
  const files: ExportFile[] = [];

  if (exportEnabled(scope, "journals")) {
    for (const record of selected(
      dataset.journals,
      includeDeleted,
      (entry) => entry.journal.deletedAt,
    )) {
      const projected = await input.projector.project({
        content: record.journal.content,
        tags: record.tags,
      });
      const year = record.journal.journalDate.slice(0, 4);
      const month = record.journal.journalDate.slice(5, 7);
      const title = record.journal.title.trim() || record.journal.journalDate;
      files.push({
        path: `journals/${year}/${month}/${record.journal.journalDate}.md`,
        bytes: encodeText(
          markdownDocument({
            id: record.journal.id,
            title,
            kind: "journal",
            localDate: record.journal.journalDate,
            revision: record.journal.revision,
            tags: record.tags,
            rendered: projected.contentMarkdown,
          }),
        ),
      });
    }
  }

  if (exportEnabled(scope, "knowledge")) {
    const knowledgeFiles: {
      readonly basePath: string;
      readonly id: string;
      readonly bytes: Uint8Array;
    }[] = [];
    const lines: NdjsonEntityLine[] = [];
    for (const record of selected(
      dataset.knowledge,
      includeDeleted,
      (entry) => entry.item.deletedAt,
    )) {
      const projected = await input.projector.project({
        content: record.item.content,
        tags: record.tags,
      });
      const title = record.item.title.trim() || "untitled";
      knowledgeFiles.push({
        basePath: `knowledge/${record.item.kind}/${sanitizeExportFileName(title)}.md`,
        id: record.item.id,
        bytes: encodeText(
          markdownDocument({
            id: record.item.id,
            title,
            kind: record.item.kind,
            revision: record.item.revision,
            tags: record.tags,
            rendered: projected.contentMarkdown,
          }),
        ),
      });
      lines.push(
        ndjsonLine({
          entityType: "knowledge_item",
          id: record.item.id,
          deletedAt: record.item.deletedAt,
          data: {
            kind: record.item.kind,
            status: record.item.status,
            title: record.item.title,
            contentJson: record.item.content.doc,
            editorSchemaVersion: record.item.content.schemaVersion,
            projectionVersion: record.item.projectionVersion,
            summary: record.item.summary,
            revision: record.item.revision,
            sourceJournalId: record.item.sourceJournalId,
            sourceBlockId: record.item.sourceBlockId,
            tags: record.tags,
            createdAt: record.item.createdAt,
            updatedAt: record.item.updatedAt,
          },
        }),
      );
    }
    files.push(...uniquePaths(knowledgeFiles));
    files.push({ path: "knowledge.ndjson", bytes: ndjsonFile(lines) });
  }

  if (exportEnabled(scope, "tasks")) {
    files.push({
      path: "tasks.ndjson",
      bytes: ndjsonFile(
        selected(dataset.tasks, includeDeleted, (task) => task.deletedAt).map((task) =>
          ndjsonLine({
            entityType: "task",
            id: task.id,
            deletedAt: task.deletedAt,
            data: {
              title: task.title,
              descriptionJson: task.description?.doc ?? null,
              editorSchemaVersion: task.description?.schemaVersion ?? null,
              descriptionText: task.descriptionText,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate,
              completedAt: task.completedAt,
              journalId: task.journalId,
              knowledgeItemId: task.knowledgeItemId,
              revision: task.revision,
              createdAt: task.createdAt,
              updatedAt: task.updatedAt,
            },
          }),
        ),
      ),
    });
  }

  if (includeAttachments && scope === "all") {
    const attachmentFiles: {
      readonly basePath: string;
      readonly id: string;
      readonly bytes: Uint8Array;
    }[] = [];
    const lines: NdjsonEntityLine[] = [];
    for (const record of selected(
      dataset.attachments,
      includeDeleted,
      (entry) => entry.attachment.deletedAt,
    )) {
      const safeName = sanitizeExportFileName(record.attachment.displayName);
      attachmentFiles.push({
        basePath: `attachments/${safeName}`,
        id: record.attachment.id,
        bytes: record.bytes,
      });
      lines.push(
        ndjsonLine({
          entityType: "attachment",
          id: record.attachment.id,
          deletedAt: record.attachment.deletedAt,
          data: {
            blobId: record.attachment.blobId,
            ownerType: record.attachment.ownerType,
            ownerId: record.attachment.ownerId,
            displayName: record.attachment.displayName,
            altText: record.attachment.altText,
            isInline: record.attachment.isInline,
            sortOrder: record.attachment.sortOrder,
            mimeType: record.attachment.mimeType,
            byteSize: record.attachment.byteSize,
            sha256: record.attachment.sha256,
            createdAt: record.attachment.createdAt,
          },
        }),
      );
    }
    files.push(...uniquePaths(attachmentFiles));
    files.push({ path: "attachments.ndjson", bytes: ndjsonFile(lines) });
  }

  if (exportEnabled(scope, "imports")) {
    const sessions = selected(dataset.imports.sessions, includeDeleted, () => null);
    files.push({
      path: "imports/sessions.ndjson",
      bytes: ndjsonFile(
        sessions.map((session) =>
          ndjsonLine({
            entityType: "import_session",
            id: session.id,
            deletedAt: null,
            data: {
              rootLabel: session.rootLabel,
              status: session.status,
              options: session.options,
              revision: session.revision,
              scannedCount: session.scannedCount,
              readyCount: session.readyCount,
              importedCount: session.importedCount,
              skippedCount: session.skippedCount,
              conflictCount: session.conflictCount,
              invalidCount: session.invalidCount,
              createdAt: session.createdAt,
              completedAt: session.completedAt,
              errorSummary: session.errorSummary,
            },
          }),
        ),
      ),
    });

    const rawFiles: {
      readonly basePath: string;
      readonly id: string;
      readonly bytes: Uint8Array;
    }[] = [];
    const lines: NdjsonEntityLine[] = [];
    for (const { sessionId, entry } of dataset.imports.entries) {
      const captured =
        includeImportRawBytes && entry.rawCaptureStatus === "captured" && entry.rawBytes !== null;
      const rawBlobPath = captured
        ? `imports/raw/${entry.id}-${sanitizeExportFileName(entry.originalFileName)}.bin`
        : null;
      if (captured && rawBlobPath !== null) {
        rawFiles.push({ basePath: rawBlobPath, id: entry.id, bytes: entry.rawBytes as Uint8Array });
      }
      lines.push(
        ndjsonLine({
          entityType: "import_entry",
          id: entry.id,
          deletedAt: null,
          data: {
            sessionId,
            relativePath: entry.relativePath,
            originalFileName: entry.originalFileName,
            detectedDate: entry.detectedDate,
            encoding: entry.encoding,
            newlineStyle: entry.newlineStyle,
            fileSha256: entry.fileSha256,
            rawSize: entry.rawSize,
            rawCaptureStatus: entry.rawCaptureStatus,
            rawBlobPath,
            rawCleanedAt: entry.rawCleanedAt,
            status: entry.status,
            conflictKind: entry.conflictKind,
            errorCode: entry.errorCode,
            errorDetail: entry.errorDetail,
            journalId: entry.journalId,
            previousJournalRevision: entry.previousJournalRevision,
            createdAt: entry.createdAt,
            committedAt: entry.committedAt,
          },
        }),
      );
    }
    files.push(...uniquePaths(rawFiles));
    files.push({ path: "imports/entries.ndjson", bytes: ndjsonFile(lines) });
  }

  files.push({
    path: "README.txt",
    bytes: encodeText(
      [
        "DailyFlow portable export",
        "",
        "Markdown files are generated from the authoritative editor JSON.",
        "NDJSON files contain one versioned entity per line for data portability.",
        "Local storage keys and absolute filesystem paths are intentionally excluded.",
        "Use a full DailyFlow backup for lossless restore operations.",
        "",
      ].join("\n"),
    ),
  });

  const manifestEntries: ExportFileManifestEntry[] = await Promise.all(
    [...files]
      .sort((left, right) => compareText(left.path, right.path))
      .map(async (file) => ({
        path: file.path,
        byteSize: file.bytes.byteLength,
        sha256: await sha256BytesHex(file.bytes),
      })),
  );
  const exportedJournals = exportEnabled(scope, "journals")
    ? selected(dataset.journals, includeDeleted, (entry) => entry.journal.deletedAt).length
    : 0;
  const exportedKnowledge = exportEnabled(scope, "knowledge")
    ? selected(dataset.knowledge, includeDeleted, (entry) => entry.item.deletedAt).length
    : 0;
  const exportedTasks = exportEnabled(scope, "tasks")
    ? selected(dataset.tasks, includeDeleted, (task) => task.deletedAt).length
    : 0;
  const exportedAttachments =
    includeAttachments && scope === "all"
      ? selected(dataset.attachments, includeDeleted, (entry) => entry.attachment.deletedAt).length
      : 0;
  const exportedImportSessions = exportEnabled(scope, "imports")
    ? dataset.imports.sessions.length
    : 0;
  const exportedImportEntries = exportEnabled(scope, "imports")
    ? dataset.imports.entries.length
    : 0;
  const manifest: ExportManifest = {
    format: "dailyflow-export",
    formatVersion: 1,
    generatedAt: input.generatedAt,
    entityCounts: {
      journals: exportedJournals,
      knowledgeItems: exportedKnowledge,
      tasks: exportedTasks,
      attachments: exportedAttachments,
      importSessions: exportedImportSessions,
      importEntries: exportedImportEntries,
    },
    fileCount: manifestEntries.length,
    totalBytes: manifestEntries.reduce((total, file) => total + file.byteSize, 0),
    files: manifestEntries,
  };
  const manifestFile: ExportFile = {
    path: "manifest.json",
    bytes: encodeText(`${stableStringify(manifest)}\n`),
  };
  const orderedFiles = [...files, manifestFile].sort((left, right) =>
    compareText(left.path, right.path),
  );

  return {
    files: orderedFiles,
    manifest,
    sha256: await sha256ExportFiles(orderedFiles),
    totalUncompressedBytes: orderedFiles.reduce((total, file) => total + file.bytes.byteLength, 0),
  };
}

async function sha256ExportFiles(files: readonly ExportFile[]): Promise<string> {
  const encodedPaths = files.map((file) => textEncoder.encode(file.path));
  const byteLength = files.reduce(
    (total, file, index) => total + 4 + encodedPaths[index]!.byteLength + 8 + file.bytes.byteLength,
    0,
  );
  const bytes = new Uint8Array(byteLength);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const [index, file] of files.entries()) {
    const pathBytes = encodedPaths[index]!;
    view.setUint32(offset, pathBytes.byteLength);
    offset += 4;
    bytes.set(pathBytes, offset);
    offset += pathBytes.byteLength;
    view.setBigUint64(offset, BigInt(file.bytes.byteLength));
    offset += 8;
    bytes.set(file.bytes, offset);
    offset += file.bytes.byteLength;
  }
  return sha256BytesHex(bytes);
}

export async function createExportArtifact(
  bundle: ExportArchiveBundle,
  filename: string,
): Promise<ExportArtifact> {
  const zipEntries: Record<string, [Uint8Array, { readonly mtime: Date; readonly level: 6 }]> = {};
  for (const file of bundle.files) {
    zipEntries[file.path] = [file.bytes, { mtime: EXPORT_ZIP_TIME, level: 6 }];
  }
  const bytes = zipSync(zipEntries);

  return {
    filename,
    mediaType: "application/zip",
    bytes,
    sha256: await sha256BytesHex(bytes),
    fileCount: bundle.files.length,
    entityCount: Object.values(bundle.manifest.entityCounts).reduce(
      (total, count) => total + count,
      0,
    ),
    totalUncompressedBytes: bundle.totalUncompressedBytes,
  };
}

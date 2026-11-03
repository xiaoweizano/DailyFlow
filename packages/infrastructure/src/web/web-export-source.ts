import type {
  ExportArtifact,
  ExportDataset,
  ExportEstimate,
  ExportOptions,
  ExportSource,
  ContentProjector,
} from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  type AttachmentRef,
  type ImportEntry,
  type ImportSession,
  type Journal,
  type JsonObject,
  type KnowledgeItem,
  type Task,
} from "@dailyflow/domain";

import { buildExportArchive, createExportArtifact } from "../shared/export/export-archive.js";
import { estimateExportDataset } from "../shared/export/export-estimate.js";
import type { DailyFlowDb } from "./db.js";
import type {
  AttachmentBlobRow,
  AttachmentLinkRow,
  ImportEntryRow,
  ImportSessionRow,
  JournalRow,
  KnowledgeItemRow,
  TagRow,
  TaskRow,
} from "./schema.js";

export interface WebExportSourceOptions {
  readonly database: DailyFlowDb;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function tagNamesByOwner(
  tags: readonly TagRow[],
  links: readonly { readonly tagId: TagRow["id"]; readonly ownerId: string }[],
): ReadonlyMap<string, readonly string[]> {
  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  const result = new Map<string, string[]>();
  for (const link of links) {
    const name = names.get(link.tagId);
    if (name === undefined) {
      continue;
    }
    const current = result.get(link.ownerId) ?? [];
    current.push(name);
    result.set(link.ownerId, current);
  }
  for (const values of result.values()) {
    values.sort(compareText);
  }
  return result;
}

function toJournal(row: JournalRow): Journal {
  return {
    id: row.id,
    journalDate: row.journalDate,
    timezone: row.timezone,
    title: row.title,
    content: createContentDocument(row.editorSchemaVersion, parseJson<JsonObject>(row.contentJson)),
    contentMarkdown: row.contentMarkdown,
    contentPlainText: row.contentPlainText,
    contentHash: row.contentHash,
    projectionVersion: row.projectionVersion,
    excerpt: row.excerpt,
    status: row.status,
    revision: parseRevision(row.revision),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toKnowledgeItem(row: KnowledgeItemRow): KnowledgeItem {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    content: createContentDocument(row.editorSchemaVersion, parseJson<JsonObject>(row.contentJson)),
    contentHash: row.contentHash,
    projectionVersion: row.projectionVersion,
    summary: row.summary,
    revision: parseRevision(row.revision),
    sourceJournalId: row.sourceJournalId,
    sourceBlockId: row.sourceBlockId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description:
      row.descriptionJson === null
        ? null
        : createContentDocument(1, parseJson<JsonObject>(row.descriptionJson)),
    descriptionText: row.descriptionText,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    journalId: row.journalId,
    knowledgeItemId: row.knowledgeItemId,
    revision: parseRevision(row.revision),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toAttachment(link: AttachmentLinkRow, blob: AttachmentBlobRow): AttachmentRef {
  return {
    id: link.id,
    blobId: link.blobId,
    ownerType: link.ownerType,
    ownerId: link.ownerId,
    displayName: link.displayName,
    altText: link.altText,
    isInline: link.isInline,
    sortOrder: link.sortOrder,
    mimeType: blob.mimeType,
    byteSize: blob.byteSize,
    storageKind: "web-blob",
    storageKey: "",
    sha256: blob.sha256,
    createdAt: link.createdAt,
    deletedAt: link.deletedAt,
  };
}

function toImportEntry(row: ImportEntryRow): ImportEntry {
  return {
    id: row.id,
    relativePath: row.relativePath,
    originalFileName: row.originalFileName,
    detectedDate: row.detectedDate,
    encoding: row.encoding,
    newlineStyle: row.newlineStyle,
    fileSha256: row.fileSha256,
    rawSize: row.rawSize,
    rawCaptureStatus: row.rawCaptureStatus,
    rawBytes: row.rawBytes === null ? null : Uint8Array.from(row.rawBytes),
    rawCleanedAt: row.rawCleanedAt,
    status: row.status,
    conflictKind: row.conflictKind,
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
    journalId: row.journalId,
    previousJournalRevision:
      row.previousJournalRevision === null ? null : parseRevision(row.previousJournalRevision),
    createdAt: row.createdAt,
    committedAt: row.committedAt,
  };
}

function toImportSession(row: ImportSessionRow): ImportSession {
  return {
    id: row.id,
    rootLabel: row.rootLabel,
    status: row.status,
    options: parseJson<JsonObject>(row.optionsJson),
    revision: parseRevision(row.revision),
    scannedCount: row.scannedCount,
    readyCount: row.readyCount,
    importedCount: row.importedCount,
    skippedCount: row.skippedCount,
    conflictCount: row.conflictCount,
    invalidCount: row.invalidCount,
    entries: [],
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorSummary: row.errorSummary,
  };
}

export class WebExportSource implements ExportSource {
  private readonly database: DailyFlowDb;

  constructor(options: WebExportSourceOptions) {
    this.database = options.database;
  }

  async estimate(options: ExportOptions): Promise<ExportEstimate> {
    return estimateExportDataset(await this.readSnapshot(), options);
  }

  async createArchive(
    options: Parameters<ExportSource["createArchive"]>[0],
    projector: ContentProjector,
  ): Promise<ExportArtifact> {
    const dataset = await this.readSnapshot();
    const bundle = await buildExportArchive({
      dataset,
      projector,
      options,
      generatedAt: options.generatedAt,
    });
    return createExportArtifact(bundle, `dailyflow-export-${options.generatedAt.slice(0, 10)}.zip`);
  }

  private async readSnapshot(): Promise<ExportDataset> {
    return this.database.transaction(
      "r",
      [
        this.database.journals,
        this.database.knowledgeItems,
        this.database.tasks,
        this.database.tags,
        this.database.journalTags,
        this.database.knowledgeTags,
        this.database.attachmentBlobs,
        this.database.attachmentLinks,
        this.database.importSessions,
        this.database.importEntries,
      ],
      async () => {
        const [
          journals,
          knowledge,
          tasks,
          tags,
          journalTags,
          knowledgeTags,
          attachmentBlobs,
          attachmentLinks,
          importSessions,
          importEntries,
        ] = await Promise.all([
          this.database.journals.toArray(),
          this.database.knowledgeItems.toArray(),
          this.database.tasks.toArray(),
          this.database.tags.toArray(),
          this.database.journalTags.toArray(),
          this.database.knowledgeTags.toArray(),
          this.database.attachmentBlobs.toArray(),
          this.database.attachmentLinks.toArray(),
          this.database.importSessions.toArray(),
          this.database.importEntries.toArray(),
        ]);
        const journalTagNames = tagNamesByOwner(
          tags,
          journalTags.map((link) => ({ ownerId: link.journalId, tagId: link.tagId })),
        );
        const knowledgeTagNames = tagNamesByOwner(
          tags,
          knowledgeTags.map((link) => ({
            ownerId: link.knowledgeItemId,
            tagId: link.tagId,
          })),
        );
        const blobs = new Map(attachmentBlobs.map((blob) => [blob.id, blob]));
        const attachments = (
          await Promise.all(
            attachmentLinks.flatMap((link) => {
              const blob = blobs.get(link.blobId);
              if (blob === undefined) {
                return [];
              }
              return [
                blob.bytes.arrayBuffer().then((bytes) => ({
                  attachment: toAttachment(link, blob),
                  bytes: new Uint8Array(bytes),
                })),
              ];
            }),
          )
        ).sort((left, right) => compareText(left.attachment.id, right.attachment.id));

        return {
          journals: journals
            .map((row) => ({
              journal: toJournal(row),
              tags: journalTagNames.get(row.id) ?? [],
            }))
            .sort((left, right) => compareText(left.journal.id, right.journal.id)),
          knowledge: knowledge
            .map((row) => ({
              item: toKnowledgeItem(row),
              tags: knowledgeTagNames.get(row.id) ?? [],
            }))
            .sort((left, right) => compareText(left.item.id, right.item.id)),
          tasks: tasks.map(toTask).sort((left, right) => compareText(left.id, right.id)),
          attachments,
          imports: {
            sessions: importSessions
              .map(toImportSession)
              .sort((left, right) => compareText(left.id, right.id)),
            entries: importEntries
              .map((row) => ({
                sessionId: row.sessionId,
                entry: toImportEntry(row),
              }))
              .sort((left, right) => compareText(left.entry.id, right.entry.id)),
          },
        };
      },
    );
  }
}

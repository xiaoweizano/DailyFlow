import type {
  ContentProjector,
  ExportArchiveOptions,
  ExportArtifact,
  ExportDataset,
  ExportEstimate,
  ExportOptions,
  ExportSource,
} from "@dailyflow/application";
import {
  createContentDocument,
  parseRevision,
  type AttachmentRef,
  type ImportEntry,
  type ImportSession,
  type Journal,
  type KnowledgeItem,
  type Task,
} from "@dailyflow/domain";

import {
  buildExportArchive,
  createExportArtifact,
} from "../shared/export/export-archive.js";
import { estimateExportDataset } from "../shared/export/export-estimate.js";
import type { TauriCommandClient } from "./tauri-client.js";
import type {
  ExportAttachmentDto,
  ExportImportEntryDto,
  ExportKnowledgeRecordDto,
  ExportSnapshotDto,
  ImportEntryDto,
  ImportSessionDto,
  JournalDto,
  KnowledgeItemDto,
  TaskDto,
} from "./tauri-contracts.js";

export interface DesktopExportSourceOptions {
  readonly client: Pick<TauriCommandClient, "exportSnapshot">;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toJournal(dto: JournalDto): Journal {
  return {
    id: dto.id,
    journalDate: dto.journalDate,
    timezone: dto.timezone,
    title: dto.title,
    content: createContentDocument(dto.editorSchemaVersion, dto.contentJson),
    contentMarkdown: dto.contentMarkdown,
    contentPlainText: dto.contentPlainText,
    contentHash: dto.contentHash,
    projectionVersion: dto.projectionVersion,
    excerpt: dto.excerpt,
    status: dto.status,
    revision: parseRevision(dto.revision),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toKnowledgeItem(dto: KnowledgeItemDto): KnowledgeItem {
  return {
    id: dto.id,
    kind: dto.kind,
    status: dto.status,
    title: dto.title,
    content: createContentDocument(dto.editorSchemaVersion, dto.contentJson),
    contentHash: dto.contentHash,
    projectionVersion: dto.projectionVersion,
    summary: dto.summary,
    revision: parseRevision(dto.revision),
    sourceJournalId: dto.sourceJournalId,
    sourceBlockId: dto.sourceBlockId,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description:
      dto.descriptionJson === null ? null : createContentDocument(1, dto.descriptionJson),
    descriptionText: dto.descriptionText,
    status: dto.status,
    priority: dto.priority,
    dueDate: dto.dueDate,
    completedAt: dto.completedAt,
    journalId: dto.journalId,
    knowledgeItemId: dto.knowledgeItemId,
    revision: parseRevision(dto.revision),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt,
  };
}

function toAttachment(dto: ExportAttachmentDto): AttachmentRef {
  return {
    ...dto,
    // Snapshot DTOs deliberately exclude physical storage coordinates.
    storageKind: "desktop-file",
    storageKey: dto.id,
  };
}

function toImportSession(dto: ImportSessionDto): ImportSession {
  return {
    id: dto.id,
    rootLabel: dto.rootLabel,
    status: dto.status,
    options: dto.options,
    revision: parseRevision(dto.revision),
    scannedCount: dto.scannedCount,
    readyCount: dto.readyCount,
    importedCount: dto.importedCount,
    skippedCount: dto.skippedCount,
    conflictCount: dto.conflictCount,
    invalidCount: dto.invalidCount,
    entries: [],
    createdAt: dto.createdAt,
    completedAt: dto.completedAt,
    errorSummary: dto.errorSummary,
  };
}

function toImportEntry(dto: ImportEntryDto): ImportEntry {
  return {
    id: dto.id,
    relativePath: dto.relativePath,
    originalFileName: dto.originalFileName,
    detectedDate: dto.detectedDate,
    encoding: dto.encoding,
    newlineStyle: dto.newlineStyle,
    fileSha256: dto.fileSha256,
    rawSize: dto.rawSize,
    rawCaptureStatus: dto.rawCaptureStatus,
    rawBytes:
      dto.rawBytesBase64 === null ? null : base64ToBytes(dto.rawBytesBase64),
    rawCleanedAt: dto.rawCleanedAt,
    status: dto.status,
    conflictKind: dto.conflictKind,
    errorCode: dto.errorCode,
    errorDetail: dto.errorDetail,
    journalId: dto.journalId,
    previousJournalRevision:
      dto.previousJournalRevision === null
        ? null
        : parseRevision(dto.previousJournalRevision),
    createdAt: dto.createdAt,
    committedAt: dto.committedAt,
  };
}

function toDataset(snapshot: ExportSnapshotDto): ExportDataset {
  return {
    journals: snapshot.journals
      .map((dto) => ({
        journal: toJournal(dto),
        tags: [...dto.tags].sort(compareText),
      }))
      .sort((left, right) => compareText(left.journal.id, right.journal.id)),
    knowledge: snapshot.knowledge
      .map((record: ExportKnowledgeRecordDto) => ({
        item: toKnowledgeItem(record.item),
        tags: [...record.tags].sort(compareText),
      }))
      .sort((left, right) => compareText(left.item.id, right.item.id)),
    tasks: snapshot.tasks
      .map(toTask)
      .sort((left, right) => compareText(left.id, right.id)),
    attachments: snapshot.attachments
      .map((record) => ({
        attachment: toAttachment(record.attachment),
        bytes: base64ToBytes(record.bytesBase64),
      }))
      .sort((left, right) => compareText(left.attachment.id, right.attachment.id)),
    imports: {
      sessions: snapshot.imports.sessions
        .map(toImportSession)
        .sort((left, right) => compareText(left.id, right.id)),
      entries: snapshot.imports.entries
        .map((record: ExportImportEntryDto) => ({
          sessionId: record.sessionId,
          entry: toImportEntry(record.entry),
        }))
        .sort((left, right) => compareText(left.entry.id, right.entry.id)),
    },
  };
}

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export class DesktopExportSource implements ExportSource {
  private readonly client: Pick<TauriCommandClient, "exportSnapshot">;

  constructor(options: DesktopExportSourceOptions) {
    this.client = options.client;
  }

  async estimate(options: ExportOptions): Promise<ExportEstimate> {
    return estimateExportDataset(toDataset(await this.client.exportSnapshot()), options);
  }

  async createArchive(
    options: ExportArchiveOptions,
    projector: ContentProjector,
  ): Promise<ExportArtifact> {
    const bundle = await buildExportArchive({
      dataset: toDataset(await this.client.exportSnapshot()),
      projector,
      options,
      generatedAt: options.generatedAt,
    });
    return createExportArtifact(
      bundle,
      `dailyflow-export-${options.generatedAt.slice(0, 10)}.zip`,
    );
  }
}

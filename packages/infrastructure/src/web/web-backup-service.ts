import {
  PortError,
  type BackupArtifact,
  type BackupAttachmentRecord,
  type BackupCreateOptions,
  type BackupDataset,
  type BackupRestoreOptions,
  type BackupRestoreResult,
  type BackupRow,
  type BackupSafetySnapshot,
  type BackupService,
  type InspectedBackup,
} from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseUtcTimestamp,
  type Clock,
  type ContentHash,
  type EntityId,
  type IdGenerator,
  type UtcTimestamp,
} from "@dailyflow/domain";

import {
  BackupValidationError,
  buildBackupArchive,
  inspectBackupArchive,
} from "../shared/backup/index.js";
import type { DailyFlowDb } from "./db.js";
import { WEB_DATA_SCHEMA_VERSION } from "./migrations/0001-initial.js";
import type {
  AttachmentBlobRow,
  AttachmentLinkRow,
  GenericStoreRow,
  ImportEntryRow,
  ImportSessionRow,
  JournalRow,
  JournalTagRow,
  JournalVersionRow,
  KnowledgeItemRow,
  KnowledgeTagRow,
  MetaRow,
  ReportRow,
  StructuredBlockRow,
  TagRow,
  TaskRow,
} from "./schema.js";

const SAFETY_SNAPSHOT_META_KEY = "lastRestoreSafetySnapshot";

export interface WebBackupServiceOptions {
  readonly database: DailyFlowDb;
  readonly clock: Clock;
  readonly deviceId?: string;
  readonly ids?: IdGenerator;
  readonly appVersion?: string;
}

interface ReadSnapshot {
  readonly journals: readonly JournalRow[];
  readonly journalVersions: readonly JournalVersionRow[];
  readonly structuredBlocks: readonly StructuredBlockRow[];
  readonly knowledgeItems: readonly KnowledgeItemRow[];
  readonly knowledgeLinks: readonly GenericStoreRow[];
  readonly tasks: readonly TaskRow[];
  readonly tags: readonly TagRow[];
  readonly journalTags: readonly JournalTagRow[];
  readonly knowledgeTags: readonly KnowledgeTagRow[];
  readonly reports: readonly ReportRow[];
  readonly importSessions: readonly ImportSessionRow[];
  readonly importEntries: readonly ImportEntryRow[];
  readonly attachmentBlobs: readonly AttachmentBlobRow[];
  readonly attachmentLinks: readonly AttachmentLinkRow[];
}

interface StoredSafetySnapshot {
  readonly fileName: string;
  readonly contentDigest: ContentHash;
  readonly bytes: Uint8Array;
  readonly createdAt: UtcTimestamp;
}

function invalidBackup(error: BackupValidationError): PortError {
  return new PortError("BACKUP_INVALID", {
    message: error.message,
  });
}

function copyRows<T extends object>(rows: readonly T[]): BackupRow[] {
  return rows.map((row) => ({ ...row }) as BackupRow);
}

function copyImportEntry(row: ImportEntryRow): BackupRow {
  return {
    ...row,
    rawBytes: row.rawBytes === null ? null : Uint8Array.from(row.rawBytes),
  };
}

function toDataset(
  snapshot: ReadSnapshot,
  attachmentBytes: ReadonlyMap<string, Uint8Array>,
): BackupDataset {
  const blobs = new Map(snapshot.attachmentBlobs.map((blob) => [blob.id, blob] as const));
  const attachments: BackupAttachmentRecord[] = [];

  for (const link of snapshot.attachmentLinks) {
    const blob = blobs.get(link.blobId);
    if (blob === undefined) {
      throw new PortError("STORAGE_UNAVAILABLE", {
        message: `Attachment blob ${link.blobId} is missing`,
        retryable: false,
      });
    }
    attachments.push({
      link: { ...link },
      blob: {
        id: blob.id,
        sha256: blob.sha256,
        byteSize: blob.byteSize,
        mimeType: blob.mimeType,
        createdAt: blob.createdAt,
        orphanedAt: blob.orphanedAt,
      },
      bytes: attachmentBytes.get(blob.id) ?? new Uint8Array(),
    });
  }

  return {
    journals: copyRows(snapshot.journals),
    journalVersions: copyRows(snapshot.journalVersions),
    structuredBlocks: copyRows(snapshot.structuredBlocks),
    knowledgeItems: copyRows(snapshot.knowledgeItems),
    knowledgeLinks: copyRows(snapshot.knowledgeLinks),
    tasks: copyRows(snapshot.tasks),
    tags: copyRows(snapshot.tags),
    journalTags: copyRows(snapshot.journalTags),
    knowledgeTags: copyRows(snapshot.knowledgeTags),
    reports: copyRows(snapshot.reports),
    importSessions: copyRows(snapshot.importSessions),
    importEntries: snapshot.importEntries.map(copyImportEntry),
    attachments,
  };
}

function hasRows(snapshot: ReadSnapshot): boolean {
  return [
    snapshot.journals,
    snapshot.journalVersions,
    snapshot.structuredBlocks,
    snapshot.knowledgeItems,
    snapshot.knowledgeLinks,
    snapshot.tasks,
    snapshot.tags,
    snapshot.journalTags,
    snapshot.knowledgeTags,
    snapshot.reports,
    snapshot.importSessions,
    snapshot.importEntries,
    snapshot.attachmentBlobs,
    snapshot.attachmentLinks,
  ].some((rows) => rows.length > 0);
}

function fileBytes(inspected: InspectedBackup, path: string | null): Uint8Array | null {
  if (path === null || path === "") {
    return null;
  }
  const file = inspected.files.find((candidate) => candidate.path === path);
  if (file === undefined) {
    throw new PortError("BACKUP_INVALID", {
      message: `Backup import file ${path} is missing`,
    });
  }
  return file.bytes;
}

function restoredImportEntries(inspected: InspectedBackup): ImportEntryRow[] {
  return inspected.dataset.importEntries.map((row) => {
    const rawBlobPath = typeof row.rawBlobPath === "string" ? row.rawBlobPath : null;
    const rest = { ...row };
    delete rest.rawBlobPath;
    return {
      ...rest,
      rawBytes: fileBytes(inspected, rawBlobPath),
    } as unknown as ImportEntryRow;
  });
}

function restoredAttachments(inspected: InspectedBackup): {
  readonly blobs: AttachmentBlobRow[];
  readonly links: AttachmentLinkRow[];
} {
  const blobs = new Map<string, AttachmentBlobRow>();
  const links: AttachmentLinkRow[] = [];

  for (const record of inspected.dataset.attachments) {
    const link = record.link as unknown as AttachmentLinkRow;
    const sourceBlob = record.blob as Record<string, unknown>;
    const id = String(sourceBlob.id);
    const mimeType = String(sourceBlob.mimeType);
    if (!blobs.has(id)) {
      blobs.set(id, {
        id: parseEntityId(id),
        sha256: parseContentHash(String(sourceBlob.sha256)),
        byteSize: Number(sourceBlob.byteSize),
        mimeType,
        storageKind: "web-blob",
        storageKey: id,
        bytes: new Blob([record.bytes.slice()], { type: mimeType }),
        createdAt: parseUtcTimestamp(String(sourceBlob.createdAt)),
        orphanedAt:
          sourceBlob.orphanedAt === null ? null : parseUtcTimestamp(String(sourceBlob.orphanedAt)),
      });
    }
    links.push(link);
  }

  return {
    blobs: [...blobs.values()],
    links,
  };
}

export class WebBackupService implements BackupService {
  private readonly database: DailyFlowDb;
  private readonly clock: Clock;
  private readonly configuredDeviceId: EntityId | null;
  private readonly ids: IdGenerator | null;
  private readonly appVersion: string;

  constructor(options: WebBackupServiceOptions) {
    this.database = options.database;
    this.clock = options.clock;
    this.configuredDeviceId =
      options.deviceId === undefined ? null : parseEntityId(options.deviceId);
    this.ids = options.ids ?? null;
    this.appVersion = options.appVersion ?? "0.1.0";
  }

  async create(options: BackupCreateOptions): Promise<BackupArtifact> {
    const snapshot = await this.readSnapshot();
    const blobs = new Map(snapshot.attachmentBlobs.map((blob) => [blob.id, blob] as const));
    const attachmentBytes = new Map(
      await Promise.all(
        [...blobs.values()].map(
          async (blob) => [blob.id, new Uint8Array(await blob.bytes.arrayBuffer())] as const,
        ),
      ),
    );

    return buildBackupArchive({
      dataset: toDataset(snapshot, attachmentBytes),
      fileName: options.fileName,
      createdAt: options.createdAt,
      deviceId: await this.resolveDeviceId(),
      appVersion: this.appVersion,
      dataSchemaVersion: WEB_DATA_SCHEMA_VERSION,
    });
  }

  private async resolveDeviceId(): Promise<EntityId> {
    if (this.configuredDeviceId !== null) {
      return this.configuredDeviceId;
    }

    return this.database.transaction("rw", this.database.meta, async () => {
      const existing = await this.database.meta.get("deviceId");
      if (existing !== undefined) {
        if (typeof existing.value !== "string") {
          throw new PortError("STORAGE_UNAVAILABLE", {
            message: "The stored device ID is invalid",
            retryable: false,
          });
        }
        return parseEntityId(existing.value);
      }
      if (this.ids === null) {
        throw new PortError("STORAGE_UNAVAILABLE", {
          message: "An ID generator is required to initialize the device ID",
          retryable: false,
        });
      }

      const deviceId = parseEntityId(this.ids.nextId());
      await this.database.meta.put({
        key: "deviceId",
        value: deviceId,
        updatedAt: parseUtcTimestamp(this.clock.nowUtc()),
      });
      return deviceId;
    });
  }

  async inspect(bytes: Uint8Array): Promise<InspectedBackup> {
    try {
      return await inspectBackupArchive(bytes);
    } catch (error) {
      if (error instanceof BackupValidationError) {
        throw invalidBackup(error);
      }
      throw error;
    }
  }

  async restore(bytes: Uint8Array, options: BackupRestoreOptions): Promise<BackupRestoreResult> {
    const inspected = await this.inspect(bytes);
    if (inspected.manifest.contentDigest !== options.expectedContentDigest) {
      throw new PortError("BACKUP_INVALID", {
        message: "The confirmed backup digest does not match the archive",
      });
    }

    const snapshot = await this.readSnapshot();
    const safetyArtifact = hasRows(snapshot)
      ? await this.create({
          fileName: `dailyflow-safety-${this.clock.nowUtc().slice(0, 10)}.dailyflow-backup.zip`,
          createdAt: parseUtcTimestamp(this.clock.nowUtc()),
        })
      : null;
    const safetySnapshot: BackupSafetySnapshot | null =
      safetyArtifact === null
        ? null
        : {
            fileName: safetyArtifact.filename,
            contentDigest: parseContentHash(safetyArtifact.manifest.contentDigest),
          };
    const safetyValue: StoredSafetySnapshot | null =
      safetyArtifact === null
        ? null
        : {
            fileName: safetyArtifact.filename,
            contentDigest: parseContentHash(safetyArtifact.manifest.contentDigest),
            bytes: safetyArtifact.bytes,
            createdAt: parseUtcTimestamp(safetyArtifact.manifest.createdAt),
          };
    const attachments = restoredAttachments(inspected);
    const importEntries = restoredImportEntries(inspected);
    const restoredAt = parseUtcTimestamp(this.clock.nowUtc());

    await this.database.transaction(
      "rw",
      [
        this.database.meta,
        this.database.journals,
        this.database.journalVersions,
        this.database.structuredBlocks,
        this.database.knowledgeItems,
        this.database.knowledgeLinks,
        this.database.tasks,
        this.database.tags,
        this.database.journalTags,
        this.database.knowledgeTags,
        this.database.reports,
        this.database.importSessions,
        this.database.importEntries,
        this.database.attachmentBlobs,
        this.database.attachmentLinks,
        this.database.searchDocs,
        this.database.searchTermPostings,
      ],
      async () => {
        await Promise.all([
          this.database.journals.clear(),
          this.database.journalVersions.clear(),
          this.database.structuredBlocks.clear(),
          this.database.knowledgeItems.clear(),
          this.database.knowledgeLinks.clear(),
          this.database.tasks.clear(),
          this.database.tags.clear(),
          this.database.journalTags.clear(),
          this.database.knowledgeTags.clear(),
          this.database.reports.clear(),
          this.database.importSessions.clear(),
          this.database.importEntries.clear(),
          this.database.attachmentLinks.clear(),
          this.database.attachmentBlobs.clear(),
          this.database.searchDocs.clear(),
          this.database.searchTermPostings.clear(),
        ]);

        await Promise.all([
          this.database.journals.bulkAdd(inspected.dataset.journals as unknown as JournalRow[]),
          this.database.journalVersions.bulkAdd(
            inspected.dataset.journalVersions as unknown as JournalVersionRow[],
          ),
          this.database.structuredBlocks.bulkAdd(
            inspected.dataset.structuredBlocks as unknown as StructuredBlockRow[],
          ),
          this.database.knowledgeItems.bulkAdd(
            inspected.dataset.knowledgeItems as unknown as KnowledgeItemRow[],
          ),
          this.database.knowledgeLinks.bulkAdd(
            inspected.dataset.knowledgeLinks as unknown as GenericStoreRow[],
          ),
          this.database.tasks.bulkAdd(inspected.dataset.tasks as unknown as TaskRow[]),
          this.database.tags.bulkAdd(inspected.dataset.tags as unknown as TagRow[]),
          this.database.journalTags.bulkAdd(
            inspected.dataset.journalTags as unknown as JournalTagRow[],
          ),
          this.database.knowledgeTags.bulkAdd(
            inspected.dataset.knowledgeTags as unknown as KnowledgeTagRow[],
          ),
          this.database.reports.bulkAdd(inspected.dataset.reports as unknown as ReportRow[]),
          this.database.importSessions.bulkAdd(
            inspected.dataset.importSessions as unknown as ImportSessionRow[],
          ),
          this.database.importEntries.bulkAdd(importEntries),
          this.database.attachmentBlobs.bulkAdd(attachments.blobs),
          this.database.attachmentLinks.bulkAdd(attachments.links),
        ]);

        const metadata: MetaRow[] = [
          {
            key: "dataSchemaVersion",
            value: inspected.manifest.dataSchemaVersion,
            updatedAt: restoredAt,
          },
          {
            key: "searchIndexState",
            value: "stale",
            updatedAt: restoredAt,
          },
        ];
        await this.database.meta.bulkPut(metadata);
        if (safetyValue === null) {
          await this.database.meta.delete(SAFETY_SNAPSHOT_META_KEY);
        } else {
          await this.database.meta.put({
            key: SAFETY_SNAPSHOT_META_KEY,
            value: safetyValue,
            updatedAt: restoredAt,
          });
        }
      },
    );

    return {
      manifest: inspected.manifest,
      restoredAt,
      ...(safetySnapshot === null ? {} : { safetySnapshot }),
    };
  }

  private async readSnapshot(): Promise<ReadSnapshot> {
    return this.database.transaction(
      "r",
      [
        this.database.journals,
        this.database.journalVersions,
        this.database.structuredBlocks,
        this.database.knowledgeItems,
        this.database.knowledgeLinks,
        this.database.tasks,
        this.database.tags,
        this.database.journalTags,
        this.database.knowledgeTags,
        this.database.reports,
        this.database.importSessions,
        this.database.importEntries,
        this.database.attachmentBlobs,
        this.database.attachmentLinks,
      ],
      async () => {
        const [
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
          attachmentBlobs,
          attachmentLinks,
        ] = await Promise.all([
          this.database.journals.toArray(),
          this.database.journalVersions.toArray(),
          this.database.structuredBlocks.toArray(),
          this.database.knowledgeItems.toArray(),
          this.database.knowledgeLinks.toArray(),
          this.database.tasks.toArray(),
          this.database.tags.toArray(),
          this.database.journalTags.toArray(),
          this.database.knowledgeTags.toArray(),
          this.database.reports.toArray(),
          this.database.importSessions.toArray(),
          this.database.importEntries.toArray(),
          this.database.attachmentBlobs.toArray(),
          this.database.attachmentLinks.toArray(),
        ]);

        return {
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
          attachmentBlobs,
          attachmentLinks,
        };
      },
    );
  }
}

import {
  PortError,
  type BackupArtifact,
  type BackupAttachmentRecord,
  type BackupCreateOptions,
  type BackupDataset,
  type BackupRestoreOptions,
  type BackupRestoreResult,
  type BackupRow,
  type BackupService,
  type InspectedBackup,
} from "@dailyflow/application";
import {
  parseContentHash,
  parseUtcTimestamp,
  type Clock,
  type ContentHash,
  type EntityId,
  type UtcTimestamp,
} from "@dailyflow/domain";

import {
  BackupValidationError,
  buildBackupArchive,
  inspectBackupArchive,
} from "../shared/backup/index.js";
import type {
  BackupRestoreCommandDto,
  BackupRestoreResultDto,
  BackupWriteFileInputDto,
  BackupWriteFileResultDto,
} from "./tauri-contracts.js";

export interface DesktopBackupSnapshot {
  readonly deviceId: EntityId;
  readonly dataSchemaVersion: number;
  readonly appVersion: string;
  readonly journals: readonly BackupRow[];
  readonly journalVersions: readonly BackupRow[];
  readonly structuredBlocks: readonly BackupRow[];
  readonly knowledgeItems: readonly BackupRow[];
  readonly knowledgeLinks: readonly BackupRow[];
  readonly tasks: readonly BackupRow[];
  readonly tags: readonly BackupRow[];
  readonly journalTags: readonly BackupRow[];
  readonly knowledgeTags: readonly BackupRow[];
  readonly reports: readonly BackupRow[];
  readonly importSessions: readonly BackupRow[];
  readonly importEntries: readonly BackupRow[];
  readonly attachments: readonly {
    readonly link: BackupRow;
    readonly blob: BackupRow;
    readonly bytesBase64: string;
  }[];
}

export interface DesktopBackupClient {
  backupSnapshot(): Promise<DesktopBackupSnapshot>;
  backupReadFile(sourcePath: string): Promise<{ readonly bytesBase64: string }>;
  backupWriteFile(input: BackupWriteFileInputDto): Promise<BackupWriteFileResultDto>;
  backupRestore(command: DesktopBackupRestoreCommand): Promise<BackupRestoreResultDto>;
}

export interface DesktopBackupServiceOptions {
  readonly client: DesktopBackupClient;
  readonly clock?: Clock;
}

export interface DesktopBackupRestoreCommand {
  readonly expectedContentDigest: ContentHash;
  readonly dataSchemaVersion: number;
  readonly restoredAt: UtcTimestamp;
  readonly dataset: BackupRestoreCommandDto["dataset"];
  readonly attachments: BackupRestoreCommandDto["attachments"];
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))),
    );
  }
  return btoa(chunks.join(""));
}

function fromSnapshot(snapshot: DesktopBackupSnapshot): BackupDataset {
  return {
    journals: snapshot.journals,
    journalVersions: snapshot.journalVersions,
    structuredBlocks: snapshot.structuredBlocks,
    knowledgeItems: snapshot.knowledgeItems,
    knowledgeLinks: snapshot.knowledgeLinks,
    tasks: snapshot.tasks,
    tags: snapshot.tags,
    journalTags: snapshot.journalTags,
    knowledgeTags: snapshot.knowledgeTags,
    reports: snapshot.reports,
    importSessions: snapshot.importSessions,
    importEntries: snapshot.importEntries.map((entry) => {
      const { rawBytesBase64, ...row } = entry;
      return {
        ...row,
        rawBytes: typeof rawBytesBase64 === "string" ? base64ToBytes(rawBytesBase64) : null,
      };
    }),
    attachments: snapshot.attachments.map((record): BackupAttachmentRecord => ({
      link: record.link,
      blob: record.blob,
      bytes: base64ToBytes(record.bytesBase64),
    })),
  };
}

function fileBytes(inspected: InspectedBackup, path: string | null): Uint8Array | null {
  if (path === null) {
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

function restoreRows(rows: readonly BackupRow[]): BackupRestoreCommandDto["dataset"]["journals"] {
  return rows.map((row) => ({ ...row }));
}

function createRestoreCommand(
  inspected: InspectedBackup,
  options: BackupRestoreOptions,
  restoredAt: UtcTimestamp,
): DesktopBackupRestoreCommand {
  if (inspected.manifest.contentDigest !== options.expectedContentDigest) {
    throw new PortError("BACKUP_INVALID", {
      message: "The confirmed backup digest does not match the archive",
    });
  }

  return {
    expectedContentDigest: parseContentHash(inspected.manifest.contentDigest),
    dataSchemaVersion: inspected.manifest.dataSchemaVersion,
    restoredAt,
    dataset: {
      journals: restoreRows(inspected.dataset.journals),
      journalVersions: restoreRows(inspected.dataset.journalVersions),
      structuredBlocks: restoreRows(inspected.dataset.structuredBlocks),
      knowledgeItems: restoreRows(inspected.dataset.knowledgeItems),
      knowledgeLinks: restoreRows(inspected.dataset.knowledgeLinks),
      tasks: restoreRows(inspected.dataset.tasks),
      tags: restoreRows(inspected.dataset.tags),
      journalTags: restoreRows(inspected.dataset.journalTags),
      knowledgeTags: restoreRows(inspected.dataset.knowledgeTags),
      reports: restoreRows(inspected.dataset.reports),
      importSessions: restoreRows(inspected.dataset.importSessions),
      importEntries: inspected.dataset.importEntries.map((entry) => {
        const path = typeof entry.rawBlobPath === "string" ? entry.rawBlobPath : null;
        const row = { ...entry };
        delete row.rawBlobPath;
        const bytes = fileBytes(inspected, path);
        return {
          ...row,
          rawBytesBase64: bytes === null ? null : bytesToBase64(bytes),
        };
      }),
    },
    attachments: inspected.dataset.attachments.map((record) => ({
      link: { ...record.link },
      blob: { ...record.blob },
      bytesBase64: bytesToBase64(record.bytes),
    })),
  };
}

export class DesktopBackupService implements BackupService {
  private readonly client: DesktopBackupClient;
  private readonly clock: Clock;

  constructor(options: DesktopBackupServiceOptions) {
    this.client = options.client;
    this.clock = options.clock ?? systemClock;
  }

  async create(options: BackupCreateOptions): Promise<BackupArtifact> {
    const snapshot = await this.client.backupSnapshot();
    return buildBackupArchive({
      dataset: fromSnapshot(snapshot),
      fileName: options.fileName,
      createdAt: options.createdAt,
      deviceId: snapshot.deviceId,
      appVersion: snapshot.appVersion,
      dataSchemaVersion: snapshot.dataSchemaVersion,
    });
  }

  async inspect(bytes: Uint8Array): Promise<InspectedBackup> {
    try {
      return await inspectBackupArchive(bytes);
    } catch (error) {
      if (error instanceof BackupValidationError) {
        throw new PortError("BACKUP_INVALID", {
          message: error.message,
        });
      }
      throw error;
    }
  }

  async restore(bytes: Uint8Array, options: BackupRestoreOptions): Promise<BackupRestoreResult> {
    const inspected = await this.inspect(bytes);
    const command = createRestoreCommand(
      inspected,
      options,
      parseUtcTimestamp(this.clock.nowUtc()),
    );
    const result = await this.client.backupRestore(command);

    return {
      manifest: inspected.manifest,
      restoredAt: result.restoredAt,
      ...(result.safetySnapshot === undefined ? {} : { safetySnapshot: result.safetySnapshot }),
    };
  }
}

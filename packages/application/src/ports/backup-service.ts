import type { UtcTimestamp } from "@dailyflow/domain";

import type { BackupArtifact, BackupManifest, InspectedBackup } from "./backup-archive.js";

export type {
  BackupArchiveFile,
  BackupArchiveLimits,
  BackupArtifact,
  BackupAttachmentRecord,
  BackupDataset,
  BackupManifest,
  BackupRow,
  BackupValidationErrorCode,
  BuildBackupArchiveOptions,
  InspectedBackup,
} from "./backup-archive.js";

export interface BackupSaveResult {
  readonly filename: string;
  readonly bytesWritten: number;
}

export interface BackupTarget {
  save(artifact: BackupArtifact): Promise<BackupSaveResult | null>;
}

export interface BackupSourceFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

export interface BackupSource {
  select(): Promise<BackupSourceFile | null>;
}

export interface BackupCreateOptions {
  readonly fileName: string;
  readonly createdAt: UtcTimestamp;
}

export interface BackupRestoreOptions {
  readonly expectedContentDigest: string;
  readonly replaceExisting: true;
}

export interface BackupSafetySnapshot {
  readonly fileName: string;
  readonly contentDigest: string;
}

export interface BackupRestoreResult {
  readonly manifest: BackupManifest;
  readonly restoredAt: UtcTimestamp;
  readonly safetySnapshot?: BackupSafetySnapshot;
}

export interface BackupService {
  create(options: BackupCreateOptions): Promise<BackupArtifact>;
  inspect(bytes: Uint8Array): Promise<InspectedBackup>;
  restore(bytes: Uint8Array, options: BackupRestoreOptions): Promise<BackupRestoreResult>;
}

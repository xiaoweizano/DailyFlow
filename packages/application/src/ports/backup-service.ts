import type { EntityId, UtcTimestamp } from "@dailyflow/domain";

export interface BackupSource {
  readonly kind: "file" | "directory" | "web-file";
  readonly handle: unknown;
}

export interface BackupManifest {
  readonly schemaVersion: number;
  readonly dataSchemaVersion: number;
  readonly appVersion: string;
  readonly createdAt: UtcTimestamp;
  readonly deviceId: EntityId;
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly attachmentCount: number;
  readonly rawImportFileCount: number;
  readonly totalBytes: number;
  readonly sha256: string;
}

export interface BackupOptions {
  readonly destination: BackupSource;
  readonly includeImportRawBytes?: boolean;
}

export interface BackupResult {
  readonly manifest: BackupManifest;
  readonly completedAt: UtcTimestamp;
}

export interface RestoreOptions {
  readonly replaceExisting: boolean;
  readonly expectedSha256: string;
}

export interface RestoreResult {
  readonly manifest: BackupManifest;
  readonly restoredAt: UtcTimestamp;
}

export interface BackupService {
  create(options: BackupOptions): Promise<BackupResult>;
  inspect(source: BackupSource): Promise<BackupManifest>;
  restore(source: BackupSource, options: RestoreOptions): Promise<RestoreResult>;
}

import type { BackupArtifact, BackupRestoreResult, InspectedBackup } from "@dailyflow/application";
import { parseContentHash, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { vi } from "vitest";

import type {
  BackupRuntimeServices,
  BackupStorageServices,
} from "../src/data-management/backup-services.js";

const createdAt = parseUtcTimestamp("2026-11-03T03:00:00.000Z");
const digest = parseContentHash("a".repeat(64));

export const backupManifestStub: InspectedBackup["manifest"] = {
  format: "dailyflow-backup",
  formatVersion: 1,
  schemaVersion: 1,
  dataSchemaVersion: 1,
  appVersion: "0.1.0",
  createdAt,
  deviceId: parseEntityId("0196f000-0000-7000-8000-000000000001"),
  entityCounts: {},
  attachmentCount: 0,
  rawImportFileCount: 0,
  totalBytes: 3,
  contentDigest: digest,
};

export const backupArtifactStub: BackupArtifact = {
  filename: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
  mediaType: "application/zip",
  bytes: new Uint8Array([1, 2, 3]),
  sha256: digest,
  manifest: backupManifestStub,
  files: [],
  totalUncompressedBytes: 3,
};

export const inspectedBackupStub: InspectedBackup = {
  manifest: backupManifestStub,
  dataset: {
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
  },
  files: [],
};

export const restoredBackupStub: BackupRestoreResult = {
  manifest: backupManifestStub,
  restoredAt: parseUtcTimestamp("2026-11-03T03:01:00.000Z"),
};

export function createBackupServicesStub(
  overrides: Partial<BackupRuntimeServices> = {},
): BackupRuntimeServices {
  return {
    create: vi.fn(async () => ({
      status: "cancelled" as const,
    })),
    selectSource: vi.fn(async () => null),
    inspect: vi.fn(async () => inspectedBackupStub),
    restore: vi.fn(async () => restoredBackupStub),
    ...overrides,
  };
}

export function createBackupStorageStub(
  overrides: Partial<BackupStorageServices> = {},
): BackupStorageServices {
  return {
    service: {
      create: vi.fn(async () => backupArtifactStub),
      inspect: vi.fn(async () => inspectedBackupStub),
      restore: vi.fn(async () => restoredBackupStub),
    },
    source: {
      select: vi.fn(async () => null),
    },
    target: {
      save: vi.fn(async () => null),
    },
    ...overrides,
  };
}

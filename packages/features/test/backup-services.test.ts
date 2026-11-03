import type {
  BackupArtifact,
  BackupRestoreResult,
  BackupService,
  BackupTarget,
  InspectedBackup,
} from "@dailyflow/application";
import { parseContentHash, parseEntityId, parseUtcTimestamp, type Clock } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createBackupRuntimeServices,
  type BackupSource,
} from "../src/data-management/backup-services.js";

const createdAt = parseUtcTimestamp("2026-11-03T03:00:00.000Z");
const digest = parseContentHash("a".repeat(64));

const manifest: InspectedBackup["manifest"] = {
  format: "dailyflow-backup",
  formatVersion: 1,
  schemaVersion: 1,
  dataSchemaVersion: 1,
  appVersion: "0.1.0",
  createdAt,
  deviceId: parseEntityId("0196f000-0000-7000-8000-000000000001"),
  entityCounts: { journals: 1 },
  attachmentCount: 0,
  rawImportFileCount: 0,
  totalBytes: 10,
  contentDigest: digest,
};

const artifact: BackupArtifact = {
  filename: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
  mediaType: "application/zip",
  bytes: new Uint8Array([1, 2, 3]),
  sha256: digest,
  manifest,
  files: [],
  totalUncompressedBytes: 10,
};

const inspected: InspectedBackup = {
  manifest,
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

const restored: BackupRestoreResult = {
  manifest,
  restoredAt: parseUtcTimestamp("2026-11-03T03:01:00.000Z"),
};

const clock: Clock = {
  nowUtc: () => createdAt,
};

function createDependencies() {
  const service: BackupService = {
    create: vi.fn(async () => artifact),
    inspect: vi.fn(async () => inspected),
    restore: vi.fn(async () => restored),
  };
  const target: BackupTarget = {
    save: vi.fn(async () => ({
      filename: artifact.filename,
      bytesWritten: artifact.bytes.byteLength,
    })),
  };
  const source: BackupSource = {
    select: vi.fn(async () => ({
      filename: artifact.filename,
      bytes: artifact.bytes,
    })),
  };

  return { service, source, target };
}

describe("backup runtime services", () => {
  it("coordinates backup selection, inspection, creation, and restore", async () => {
    const dependencies = createDependencies();
    const services = createBackupRuntimeServices({ ...dependencies, clock });

    await expect(services.create()).resolves.toMatchObject({
      status: "saved",
      artifact: { filename: artifact.filename },
    });
    await expect(services.selectSource()).resolves.toMatchObject({
      filename: artifact.filename,
    });
    const selected = await services.selectSource();
    expect(selected).not.toBeNull();
    await expect(services.inspect(selected!)).resolves.toEqual(inspected);
    await expect(services.restore(selected!, digest)).resolves.toEqual(restored);

    expect(dependencies.target.save).toHaveBeenCalledWith(artifact);
    expect(dependencies.service.inspect).toHaveBeenCalledWith(artifact.bytes);
    expect(dependencies.service.restore).toHaveBeenCalledWith(artifact.bytes, {
      expectedContentDigest: digest,
      replaceExisting: true,
    });
  });

  it("preserves cancelled backup and source selection outcomes", async () => {
    const dependencies = createDependencies();
    dependencies.target.save = vi.fn(async () => null);
    dependencies.source.select = vi.fn(async () => null);
    const services = createBackupRuntimeServices({ ...dependencies, clock });

    await expect(services.create()).resolves.toEqual({ status: "cancelled" });
    await expect(services.selectSource()).resolves.toBeNull();
  });

  it("turns invalid archives into an actionable user-facing error", async () => {
    const dependencies = createDependencies();
    const { PortError } = await import("@dailyflow/application");
    dependencies.service.inspect = vi.fn(async () => {
      throw new PortError("BACKUP_INVALID", {
        message: "附件哈希不匹配",
      });
    });
    const services = createBackupRuntimeServices({ ...dependencies, clock });
    const file = { filename: "broken.zip", bytes: new Uint8Array([0]) };

    await expect(services.inspect(file)).rejects.toThrow("备份文件校验失败：附件哈希不匹配");
  });
});

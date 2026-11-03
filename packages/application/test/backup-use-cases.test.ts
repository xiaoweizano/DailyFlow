import type { BackupArtifact, BackupManifest, InspectedBackup } from "../src/index.js";
import { parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import {
  PortError,
  type BackupRestoreResult,
  type BackupService,
  type BackupTarget,
} from "../src/index.js";
import { createBackup } from "../src/use-cases/create-backup.js";
import { inspectBackup } from "../src/use-cases/inspect-backup.js";
import { restoreBackup } from "../src/use-cases/restore-backup.js";

const NOW = "2026-11-03T08:00:00.000Z";
const DIGEST = "a".repeat(64);

const manifest: BackupManifest = {
  format: "dailyflow-backup",
  formatVersion: 1,
  schemaVersion: 1,
  dataSchemaVersion: 1,
  appVersion: "0.1.0",
  createdAt: parseUtcTimestamp(NOW),
  deviceId: parseEntityId("019a3c10-0000-7000-8000-000000000001"),
  entityCounts: {},
  attachmentCount: 0,
  rawImportFileCount: 0,
  totalBytes: 0,
  contentDigest: DIGEST,
};

const artifact: BackupArtifact = {
  filename: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
  mediaType: "application/zip",
  bytes: new Uint8Array([1, 2, 3]),
  sha256: "b".repeat(64),
  manifest,
  files: [],
  totalUncompressedBytes: 0,
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

const restoreImplementation: BackupService["restore"] = async () =>
  ({
    manifest,
    restoredAt: parseUtcTimestamp(NOW),
    safetySnapshot: {
      fileName: "before-restore.dailyflow-backup.zip",
      contentDigest: DIGEST,
    },
  }) satisfies BackupRestoreResult;

function service(overrides: Partial<BackupService> = {}): BackupService {
  return {
    async create() {
      return artifact;
    },
    async inspect() {
      return inspected;
    },
    restore: restoreImplementation,
    ...overrides,
  };
}

describe("backup use cases", () => {
  it("creates an archive and saves it through the platform target", async () => {
    const create = vi.fn(service().create);
    const save = vi.fn<BackupTarget["save"]>().mockResolvedValue({
      filename: artifact.filename,
      bytesWritten: artifact.bytes.byteLength,
    });

    const result = await createBackup(
      {
        service: { ...service(), create },
        target: { save },
        clock: { nowUtc: () => NOW },
      },
      {},
    );

    expect(create).toHaveBeenCalledWith({
      fileName: artifact.filename,
      createdAt: NOW,
    });
    expect(save).toHaveBeenCalledWith(artifact);
    expect(result).toEqual({
      ok: true,
      value: {
        status: "saved",
        artifact,
        saved: {
          filename: artifact.filename,
          bytesWritten: artifact.bytes.byteLength,
        },
      },
    });
  });

  it("treats a cancelled save as a successful cancellation", async () => {
    const save = vi.fn<BackupTarget["save"]>().mockResolvedValue(null);

    const result = await createBackup(
      {
        service: service(),
        target: { save },
        clock: { nowUtc: () => NOW },
      },
      {},
    );

    expect(result).toEqual({
      ok: true,
      value: { status: "cancelled" },
    });
  });

  it("inspects bytes without accepting another input shape", async () => {
    const inspect = vi.fn(service().inspect);
    const bytes = new Uint8Array([4, 5, 6]);

    const inspectedResult = await inspectBackup({ service: { ...service(), inspect } }, { bytes });
    const invalidResult = await inspectBackup(
      { service: { ...service(), inspect } },
      { bytes: "not-bytes" },
    );

    expect(inspectedResult).toEqual({ ok: true, value: inspected });
    expect(inspect).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledWith(bytes);
    expect(invalidResult).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fields: { bytes: expect.any(String) },
      },
    });
  });

  it("requires an archive digest and explicit destructive confirmation to restore", async () => {
    const restore = vi.fn<BackupService["restore"]>(restoreImplementation);
    const dependencies = { service: { ...service(), restore } };

    const invalid = await restoreBackup(dependencies, {
      bytes: new Uint8Array([1]),
      expectedContentDigest: "not-a-digest",
      replaceExisting: false,
    });
    const valid = await restoreBackup(dependencies, {
      bytes: new Uint8Array([1]),
      expectedContentDigest: DIGEST,
      replaceExisting: true,
    });

    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          expectedContentDigest: expect.any(String),
          replaceExisting: expect.any(String),
        },
      },
    });
    expect(restore).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledWith(new Uint8Array([1]), {
      expectedContentDigest: DIGEST,
      replaceExisting: true,
    });
    expect(valid).toMatchObject({ ok: true });
  });

  it("maps invalid backup errors and preserves unexpected failures", async () => {
    const invalid = await inspectBackup(
      {
        service: service({
          async inspect() {
            throw new PortError("BACKUP_INVALID", {
              message: "checksums.json does not match data files",
            });
          },
        }),
      },
      { bytes: new Uint8Array([1]) },
    );
    expect(invalid).toEqual({
      ok: false,
      error: {
        code: "BACKUP_INVALID",
        reason: "checksums.json does not match data files",
      },
    });

    await expect(
      restoreBackup(
        {
          service: service({
            async restore() {
              throw new Error("transaction failed");
            },
          }),
        },
        {
          bytes: new Uint8Array([1]),
          expectedContentDigest: DIGEST,
          replaceExisting: true,
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "STORAGE_UNAVAILABLE", retryable: true },
    });
  });
});

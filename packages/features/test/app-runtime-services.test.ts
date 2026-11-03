import type {
  BackupArtifact,
  BackupService,
  BackupTarget,
  ImportRepository,
  ImportService,
  ImportSource,
  ImportTxtAnalyzer,
  TxtDocumentConverter,
} from "@dailyflow/application";
import { parseContentHash, parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createAppRuntimeServices,
  type CreateAppRuntimeServicesOptions,
} from "../src/app-runtime-services.js";
import { createBackupStorageStub } from "./backup-stub.js";

describe("createAppRuntimeServices", () => {
  it("composes backup runtime services from injected backup storage", async () => {
    const createdAt = parseUtcTimestamp("2026-11-03T03:00:00.000Z");
    const artifact: BackupArtifact = {
      filename: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
      mediaType: "application/zip",
      bytes: new Uint8Array([1, 2, 3]),
      sha256: parseContentHash("a".repeat(64)),
      manifest: {
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
        contentDigest: parseContentHash("a".repeat(64)),
      },
      files: [],
      totalUncompressedBytes: 3,
    };
    const service: BackupService = {
      create: vi.fn(async () => artifact),
      inspect: vi.fn(),
      restore: vi.fn(),
    };
    const target: BackupTarget = {
      save: vi.fn(async () => ({
        filename: artifact.filename,
        bytesWritten: artifact.bytes.byteLength,
      })),
    };
    const options = {
      analytics: {},
      attachments: {},
      backupStorage: {
        service,
        source: { select: vi.fn(async () => null) },
        target,
      },
      clock: { nowUtc: () => createdAt },
      exportStorage: {
        source: {},
        target: {},
      },
      importStorage: {} as never,
      journals: {},
      knowledge: {},
      reports: {},
      search: {},
      tasks: {},
      timeline: {},
    } as unknown as CreateAppRuntimeServicesOptions;

    const services = createAppRuntimeServices(options);

    await expect(services.backups.create()).resolves.toMatchObject({
      status: "saved",
      artifact: { filename: artifact.filename },
    });
    expect(service.create).toHaveBeenCalledWith({
      fileName: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
      createdAt,
    });
    expect(target.save).toHaveBeenCalledWith(artifact);
  });

  it("composes the import service from injected storage adapters", async () => {
    const root = { label: "logs", handle: { id: "root" } };
    const source: ImportSource = {
      selectRoot: vi.fn(async () => root),
      scan: vi.fn(async function* () {
        yield* [];
      }),
    };
    const repository = {} as ImportRepository;
    const analyzer: ImportTxtAnalyzer = {
      analyze: vi.fn(async () => ({
        encoding: "utf8" as const,
        text: "entry",
        newlineStyle: "lf" as const,
      })),
    };
    const converter: TxtDocumentConverter = {
      toContent: vi.fn(),
    };
    const options = {
      analytics: {},
      attachments: {},
      backupStorage: createBackupStorageStub(),
      exportStorage: {
        source: {},
        target: {},
      },
      importStorage: { analyzer, converter, repository, source },
      journals: {},
      knowledge: {},
      reports: {},
      search: {},
      tasks: {},
      timeline: {},
    } as unknown as CreateAppRuntimeServicesOptions;

    const services = createAppRuntimeServices(options);
    const imports = (services as unknown as { imports: ImportService }).imports;

    await expect(imports.selectRoot()).resolves.toBe(root);
    expect(source.selectRoot).toHaveBeenCalledOnce();
  });
});

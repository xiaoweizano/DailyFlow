import {
  parseContentHash,
  type Clock,
  type UtcTimestamp,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import {
  PortError,
  type ContentProjector,
  type ExportArtifact,
  type ExportOptions,
  type ExportSource,
  type ExportTarget,
} from "../src/index.js";
import { exportData } from "../src/use-cases/export-data.js";

const artifact: ExportArtifact = {
  filename: "dailyflow-export.zip",
  mediaType: "application/zip",
  bytes: new Uint8Array([1, 2, 3]),
  sha256: "a".repeat(64),
  fileCount: 2,
  entityCount: 1,
  totalUncompressedBytes: 12,
};

const projector: ContentProjector = {
  async project() {
    return {
      contentMarkdown: "",
      contentPlainText: "",
      contentHash: parseContentHash("b".repeat(64)),
      excerpt: "",
      structuredBlocks: [],
      searchDocuments: [],
    };
  },
};

const clock: Clock = {
  nowUtc: () => "2026-11-03T00:00:00.000Z",
};

function source(overrides: Partial<ExportSource> = {}): ExportSource {
  return {
    async estimate(options) {
      return {
        entityCount: options.scope === "all" ? 3 : 1,
        fileCount: 2,
        estimatedBytes: 128,
      };
    },
    async createArchive() {
      return artifact;
    },
    ...overrides,
  };
}

describe("export data use case", () => {
  it("normalizes omitted options before estimating and creating the archive", async () => {
    const estimate = vi.fn(source().estimate);
    const createArchive = vi.fn(source().createArchive);
    const save = vi.fn<ExportTarget["save"]>().mockResolvedValue({
      filename: artifact.filename,
      bytesWritten: artifact.bytes.byteLength,
    });

    const result = await exportData(
      {
        source: { estimate, createArchive },
        target: { save },
        projector,
        clock,
      },
      {},
    );

    const expectedEstimateOptions: ExportOptions = {
      scope: "all",
      includeDeleted: false,
      includeAttachments: true,
      includeImportRawBytes: true,
    };
    const expectedArchiveOptions = {
      ...expectedEstimateOptions,
      generatedAt: "2026-11-03T00:00:00.000Z",
    };
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
    expect(estimate).toHaveBeenCalledOnce();
    expect(estimate).toHaveBeenCalledWith(expectedEstimateOptions);
    expect(createArchive).toHaveBeenCalledOnce();
    expect(createArchive).toHaveBeenCalledWith(expectedArchiveOptions, projector);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(artifact);
  });

  it("returns a successful cancellation outcome without inventing saved bytes", async () => {
    const save = vi.fn<ExportTarget["save"]>().mockResolvedValue(null);

    const result = await exportData(
      {
        source: source(),
        target: { save },
        projector,
        clock,
      },
      { scope: "journals" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        status: "cancelled",
      },
    });
  });

  it("rejects invalid input before touching storage", async () => {
    const estimate = vi.fn(source().estimate);
    const createArchive = vi.fn(source().createArchive);
    const save = vi.fn<ExportTarget["save"]>();

    const result = await exportData(
      {
        source: { estimate, createArchive },
        target: { save },
        projector,
        clock,
      },
      { scope: "everything" },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fields: {
          scope: expect.any(String),
        },
      },
    });
    expect(estimate).not.toHaveBeenCalled();
    expect(createArchive).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("maps source and target boundary errors through the application error contract", async () => {
    const estimateFailure = await exportData(
      {
        source: source({
          async estimate() {
            throw new PortError("QUOTA_EXCEEDED", { requiredBytes: 512 });
          },
        }),
        target: { save: vi.fn<ExportTarget["save"]>() },
        projector,
        clock,
      },
      {},
    );
    expect(estimateFailure).toEqual({
      ok: false,
      error: {
        code: "QUOTA_EXCEEDED",
        requiredBytes: 512,
      },
    });

    const saveFailure = await exportData(
      {
        source: source(),
        target: {
          async save() {
            throw new PortError("STORAGE_UNAVAILABLE", { retryable: false });
          },
        },
        projector,
        clock,
      },
      {},
    );
    expect(saveFailure).toEqual({
      ok: false,
      error: {
        code: "STORAGE_UNAVAILABLE",
        retryable: false,
      },
    });
  });

  it("passes an explicit timestamp only through the source archive contract", async () => {
    const generatedAt = "2026-11-03T00:00:00.000Z" as UtcTimestamp;
    const createArchive = vi.fn(source().createArchive);

    await exportData(
      {
        source: { estimate: source().estimate, createArchive },
        target: {
          async save() {
            return null;
          },
        },
        projector,
        clock,
      },
      {
        scope: "knowledge",
        includeDeleted: true,
        includeAttachments: false,
        includeImportRawBytes: false,
        generatedAt,
      },
    );

    expect(createArchive).toHaveBeenCalledWith(
      {
        scope: "knowledge",
        includeDeleted: true,
        includeAttachments: false,
        includeImportRawBytes: false,
        generatedAt,
      },
      projector,
    );
  });
});

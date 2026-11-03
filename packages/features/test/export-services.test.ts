import type { ContentProjector, ExportSource, ExportTarget } from "@dailyflow/application";
import { parseContentHash, type Clock } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { createExportRuntimeServices } from "../src/data-management/export-services.js";

const artifact = {
  filename: "dailyflow-export-2026-11-03.zip",
  mediaType: "application/zip" as const,
  bytes: new Uint8Array([1, 2, 3]),
  sha256: "a".repeat(64),
  fileCount: 2,
  entityCount: 3,
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
  nowUtc: () => "2026-11-03T03:00:00.000Z",
};

describe("export runtime services", () => {
  it("estimates and runs the export through injected source and target ports", async () => {
    const source: ExportSource = {
      estimate: vi.fn(async () => ({
        entityCount: 3,
        fileCount: 2,
        estimatedBytes: 4096,
      })),
      createArchive: vi.fn(async () => artifact),
    };
    const target: ExportTarget = {
      save: vi.fn(async () => ({
        filename: artifact.filename,
        bytesWritten: artifact.bytes.byteLength,
      })),
    };
    const services = createExportRuntimeServices({ source, target, projector, clock });
    const options = {
      scope: "journals" as const,
      includeDeleted: true,
      includeAttachments: false,
      includeImportRawBytes: false,
    };

    await expect(services.estimate(options)).resolves.toEqual({
      entityCount: 3,
      fileCount: 2,
      estimatedBytes: 4096,
    });
    await expect(services.run(options)).resolves.toMatchObject({
      status: "saved",
      saved: { filename: artifact.filename },
    });
    expect(source.estimate).toHaveBeenCalledWith(options);
    expect(source.createArchive).toHaveBeenCalledWith(
      {
        ...options,
        generatedAt: "2026-11-03T03:00:00.000Z",
      },
      projector,
    );
  });

  it("turns a rejected application result into a user-facing runtime error", async () => {
    const services = createExportRuntimeServices({
      source: {
        estimate: vi.fn(async () => ({
          entityCount: 0,
          fileCount: 0,
          estimatedBytes: 0,
        })),
        createArchive: vi.fn(),
      },
      target: { save: vi.fn() },
      projector,
      clock,
    });

    await expect(
      services.run({
        scope: "invalid" as never,
        includeDeleted: false,
        includeAttachments: true,
        includeImportRawBytes: true,
      }),
    ).rejects.toThrow("导出参数无效");
  });
});

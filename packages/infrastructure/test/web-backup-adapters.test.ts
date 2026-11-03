import { describe, expect, it, vi } from "vitest";

import { WebBackupSource } from "../src/web/web-backup-source.js";
import { WebBackupTarget } from "../src/web/web-backup-target.js";

describe("web backup adapters", () => {
  it("reads the selected backup file without decoding it", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const picker = vi.fn(
      async () =>
        new File([bytes], "dailyflow-backup.zip", {
          type: "application/zip",
        }),
    );
    const source = new WebBackupSource({ picker });

    await expect(source.select()).resolves.toEqual({
      filename: "dailyflow-backup.zip",
      bytes,
    });
    expect(picker).toHaveBeenCalledOnce();
  });

  it("preserves a cancelled source selection", async () => {
    const source = new WebBackupSource({
      picker: vi.fn(async () => null),
    });

    await expect(source.select()).resolves.toBeNull();
  });

  it("reports a completed download using the generated backup filename", async () => {
    const saveFile = vi.fn<(blob: Blob, filename: string) => Promise<boolean>>(async () => true);
    const target = new WebBackupTarget({ saveFile });
    const artifact = {
      filename: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
      mediaType: "application/zip" as const,
      bytes: new Uint8Array([1, 2, 3]),
      sha256: "a".repeat(64),
      manifest: {} as never,
      files: [],
      totalUncompressedBytes: 3,
    };

    await expect(target.save(artifact)).resolves.toEqual({
      filename: artifact.filename,
      bytesWritten: 3,
    });
    expect(saveFile).toHaveBeenCalledOnce();
    const [blob, filename] = saveFile.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.arrayBuffer()).toEqual(Uint8Array.from([1, 2, 3]).buffer);
    expect(filename).toBe(artifact.filename);
  });

  it("preserves a cancelled browser download", async () => {
    const target = new WebBackupTarget({
      saveFile: vi.fn(async () => false),
    });
    const artifact = {
      filename: "dailyflow-backup-2026-11-03.dailyflow-backup.zip",
      mediaType: "application/zip" as const,
      bytes: new Uint8Array([1]),
      sha256: "a".repeat(64),
      manifest: {} as never,
      files: [],
      totalUncompressedBytes: 1,
    };

    await expect(target.save(artifact)).resolves.toBeNull();
  });
});

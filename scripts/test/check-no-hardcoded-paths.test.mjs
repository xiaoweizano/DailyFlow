import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

const scriptPath = fileURLToPath(new URL("../check-no-hardcoded-paths.mjs", import.meta.url));

async function withFixture(files, callback) {
  const root = await mkdtemp(join(tmpdir(), "dailyflow-paths-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = join(root, relativePath);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function run(root) {
  return spawnSync(process.execPath, [scriptPath, "--root", root], {
    encoding: "utf8",
  });
}

test("accepts portable source paths and ignores documentation examples", async () => {
  await withFixture(
    {
      "packages/domain/src/paths.ts":
        'export const attachmentRelativePath = "attachments/ab/cd/file.bin";\n',
      "docs/example.md": 'Example only: "C:\\Users\\Alice\\DailyFlow" and "/Users/alice/data"\n',
    },
    async (root) => {
      const result = run(root);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /No hard-coded user or workspace paths found/);
    },
  );
});

test("reports machine-specific Windows paths with their source location", async () => {
  await withFixture(
    {
      "apps/web/src/storage.ts":
        'const dataDirectory = "C:\\\\Users\\\\Alice\\\\AppData\\\\Roaming\\\\DailyFlow";\n',
    },
    async (root) => {
      const result = run(root);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /apps\/web\/src\/storage\.ts:1/);
      assert.match(result.stderr, /Windows user profile path/);
    },
  );
});

test("reports machine-specific macOS and Linux home paths", async () => {
  await withFixture(
    {
      "apps/desktop/src/paths.ts":
        'export const mac = "/Users/alice/Library/Application Support/DailyFlow";\n' +
        'export const linux = "/home/alice/.local/share/dailyflow";\n',
    },
    async (root) => {
      const result = run(root);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /macOS user home path/);
      assert.match(result.stderr, /Linux user home path/);
    },
  );
});

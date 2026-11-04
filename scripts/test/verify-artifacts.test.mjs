import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

const scriptPath = fileURLToPath(new URL("../verify-artifacts.mjs", import.meta.url));
const productionCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; " +
  "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

async function writeFileWithParents(root, relativePath, content) {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function writeValidSourceArtifacts(root) {
  const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${productionCsp}"></head><body><div id="root"></div></body></html>`;
  await writeFileWithParents(root, "apps/web/dist/index.html", html);
  await writeFileWithParents(root, "apps/web/dist/assets/app.js", 'console.log("web");\n');
  await writeFileWithParents(root, "apps/desktop/dist/index.html", html);
  await writeFileWithParents(root, "apps/desktop/dist/assets/app.js", 'console.log("desktop");\n');
  await writeFileWithParents(
    root,
    "apps/desktop/src-tauri/tauri.conf.json",
    JSON.stringify(
      {
        productName: "DailyFlow",
        version: "0.1.0",
        identifier: "com.dailyflow.desktop",
        app: {
          security: {
            csp: productionCsp,
          },
        },
        bundle: {
          active: true,
          targets: ["nsis", "dmg"],
          windows: {
            minimumWebview2Version: "109.0.0.0",
            webviewInstallMode: { type: "downloadBootstrapper", silent: true },
          },
          macOS: {
            minimumSystemVersion: "12.0",
            hardenedRuntime: true,
          },
        },
      },
      null,
      2,
    ),
  );
}

async function withFixture(callback) {
  const root = await mkdtemp(join(tmpdir(), "dailyflow-artifacts-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function run(root, args = []) {
  return spawnSync(process.execPath, [scriptPath, "--root", root, ...args], {
    encoding: "utf8",
  });
}

test("accepts production Web CSP, packaging metadata, and built frontends", async () => {
  await withFixture(async (root) => {
    await writeValidSourceArtifacts(root);

    const result = run(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Artifact verification passed/);
  });
});

test("rejects a CSP that permits unsafe-eval", async () => {
  await withFixture(async (root) => {
    await writeValidSourceArtifacts(root);
    await writeFileWithParents(
      root,
      "apps/web/dist/index.html",
      `<meta http-equiv="Content-Security-Policy" content="${productionCsp}; script-src 'self' 'unsafe-eval'">`,
    );

    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsafe-eval/);
  });
});

test("rejects disabled or incomplete Tauri packaging configuration", async () => {
  await withFixture(async (root) => {
    await writeValidSourceArtifacts(root);
    await writeFileWithParents(
      root,
      "apps/desktop/src-tauri/tauri.conf.json",
      JSON.stringify({
        productName: "DailyFlow",
        version: "0.1.0",
        identifier: "com.dailyflow.desktop",
        bundle: { active: false },
      }),
    );

    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /bundle\.active must be true/);
  });
});

test("rejects development paths and secret material in built frontends", async () => {
  await withFixture(async (root) => {
    await writeValidSourceArtifacts(root);
    await writeFileWithParents(
      root,
      "apps/web/dist/assets/app.js",
      'const root = "F:\\\\codex-work\\\\.tmp"; const key = "-----BEGIN PRIVATE KEY-----";\n',
    );

    const result = run(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /development workspace path/);
    assert.match(result.stderr, /private key material/);
  });
});

test("validates release version, architecture, and SHA-256 manifest", async () => {
  await withFixture(async (root) => {
    const releaseDirectory = join(root, "release");
    const artifactName = "DailyFlow_0.1.0_x64-setup.exe";
    const artifact = Buffer.from("signed installer fixture\n");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(join(releaseDirectory, artifactName), artifact);
    const digest = createHash("sha256").update(artifact).digest("hex");
    await writeFile(join(releaseDirectory, "SHA256SUMS"), `${digest}  ${artifactName}\n`, "utf8");

    const result = run(root, [
      "--scope",
      "release",
      "--release-dir",
      releaseDirectory,
      "--version",
      "0.1.0",
      "--arch",
      "x64",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Release artifact verification passed/);
  });
});

test("rejects a release artifact whose checksum no longer matches", async () => {
  await withFixture(async (root) => {
    const releaseDirectory = join(root, "release");
    const artifactName = "DailyFlow_0.1.0_x64-setup.exe";
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(join(releaseDirectory, artifactName), "tampered\n", "utf8");

    const original = await readFile(join(releaseDirectory, artifactName));
    const digest = createHash("sha256").update(original).digest("hex");
    await writeFile(join(releaseDirectory, "SHA256SUMS"), `${digest}  ${artifactName}\n`, "utf8");
    await writeFile(join(releaseDirectory, artifactName), "changed\n", "utf8");

    const result = run(root, [
      "--scope",
      "release",
      "--release-dir",
      releaseDirectory,
      "--version",
      "0.1.0",
      "--arch",
      "x64",
    ]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /SHA-256 mismatch/);
  });
});

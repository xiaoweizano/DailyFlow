import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const productionCspRequirements = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
];
const forbiddenContent = [
  {
    label: "development workspace path",
    expression: /[A-Za-z]:[\\/]+(?:codex-work|workspace|projects?)[\\/]+/i,
  },
  {
    label: "Windows user profile path",
    expression: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/i,
  },
  {
    label: "macOS user home path",
    expression: /\/Users\/[^/\s"'`]+\//,
  },
  {
    label: "Linux user home path",
    expression: /\/home\/[^/\s"'`]+\//,
  },
  {
    label: "private key material",
    expression: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  },
];
const textArtifactExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
]);
const releaseExtensions = new Set([".app", ".dmg", ".exe", ".msi"]);

function parseArguments(argv) {
  const options = {
    root: process.cwd(),
    scope: "source",
    releaseDirectory: undefined,
    version: undefined,
    architecture: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      return value;
    };
    if (argument === "--root") {
      options.root = readValue();
    } else if (argument === "--scope") {
      options.scope = readValue();
    } else if (argument === "--release-dir") {
      options.releaseDirectory = readValue();
    } else if (argument === "--version") {
      options.version = readValue();
    } else if (argument === "--arch") {
      options.architecture = readValue();
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  options.root = resolve(options.root);
  options.releaseDirectory = options.releaseDirectory
    ? resolve(options.releaseDirectory)
    : resolve(options.root, "release");
  return options;
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function walkFiles(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return [];
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function extractCsp(html, label) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if (!/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)) {
      continue;
    }
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (content) {
      return content[1] ?? content[2];
    }
  }
  throw new Error(`${label} does not contain a Content-Security-Policy meta tag`);
}

function validateWebCsp(root) {
  const indexPath = resolve(root, "apps/web/dist/index.html");
  requireFile(indexPath, "Web build index");
  const csp = extractCsp(readFileSync(indexPath, "utf8"), "Web build index");
  if (/\bunsafe-eval\b/i.test(csp)) {
    throw new Error("Web build CSP must not allow unsafe-eval");
  }
  if (/\bwss?:/i.test(csp)) {
    throw new Error("Web build CSP must not allow development WebSocket origins");
  }
  for (const requirement of productionCspRequirements) {
    if (!csp.includes(requirement)) {
      throw new Error(`Web build CSP is missing: ${requirement}`);
    }
  }
}

function validateTauriConfiguration(root) {
  const configPath = resolve(root, "apps/desktop/src-tauri/tauri.conf.json");
  requireFile(configPath, "Tauri configuration");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (config.productName !== "DailyFlow") {
    throw new Error("Tauri productName must be DailyFlow");
  }
  if (config.identifier !== "com.dailyflow.desktop") {
    throw new Error("Tauri identifier must be com.dailyflow.desktop");
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(config.version ?? "")) {
    throw new Error("Tauri version must be a valid semantic version");
  }
  if (config.bundle?.active !== true) {
    throw new Error("Tauri bundle.active must be true");
  }
  const targets = config.bundle?.targets;
  const validTargets =
    targets === "all" ||
    (Array.isArray(targets) && targets.includes("nsis") && targets.includes("dmg"));
  if (!validTargets) {
    throw new Error("Tauri bundle.targets must include Windows NSIS and macOS DMG");
  }
  const webviewMode = config.bundle?.windows?.webviewInstallMode;
  if (webviewMode?.type !== "downloadBootstrapper" || webviewMode?.silent !== true) {
    throw new Error("Tauri Windows WebView2 install mode is not configured safely");
  }
  if (!config.bundle?.windows?.minimumWebview2Version) {
    throw new Error("Tauri minimumWebview2Version must be set");
  }
  const minimumMacVersion = config.bundle?.macOS?.minimumSystemVersion;
  if (!minimumMacVersion || Number.parseFloat(minimumMacVersion) < 12) {
    throw new Error("Tauri macOS minimumSystemVersion must be 12.0 or newer");
  }
  if (config.bundle?.macOS?.hardenedRuntime !== true) {
    throw new Error("Tauri macOS hardenedRuntime must be enabled");
  }
  const appCsp = config.app?.security?.csp;
  if (typeof appCsp !== "string" || /\bunsafe-eval\b/i.test(appCsp)) {
    throw new Error("Tauri CSP must be configured and must not allow unsafe-eval");
  }
}

function validateSourceScope(root) {
  const requiredFiles = [
    "apps/web/dist/assets",
    "apps/desktop/dist/index.html",
    "apps/desktop/dist/assets",
  ];
  for (const path of requiredFiles) {
    if (!existsSync(resolve(root, path))) {
      throw new Error(`Missing built frontend artifact: ${path}`);
    }
  }
  validateWebCsp(root);
  validateTauriConfiguration(root);

  const findings = [];
  for (const directory of ["apps/web/dist", "apps/desktop/dist"]) {
    for (const file of walkFiles(resolve(root, directory))) {
      const relativePath = relative(root, file).split(sep).join("/");
      if (/\.(?:db|sqlite)(?:-(?:wal|shm))?$/i.test(file)) {
        findings.push(`${relativePath}: database file`);
        continue;
      }
      if (!textArtifactExtensions.has(extname(file)) || statSync(file).size > 5_000_000) {
        continue;
      }
      const content = readFileSync(file, "utf8");
      for (const pattern of forbiddenContent) {
        if (pattern.expression.test(content)) {
          findings.push(`${relativePath}: ${pattern.label}`);
        }
      }
    }
  }
  if (findings.length > 0) {
    throw new Error(`Forbidden artifact content:\n- ${findings.join("\n- ")}`);
  }
}

function parseChecksumManifest(manifestPath) {
  requireFile(manifestPath, "SHA256SUMS manifest");
  const entries = new Map();
  for (const line of readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) {
      throw new Error(`Invalid SHA256SUMS line: ${line}`);
    }
    entries.set(match[2], match[1].toLowerCase());
  }
  return entries;
}

function validateReleaseScope(options) {
  if (!options.version) {
    throw new Error("Release verification requires --version");
  }
  if (!options.architecture) {
    throw new Error("Release verification requires --arch");
  }
  if (!existsSync(options.releaseDirectory)) {
    throw new Error(`Missing release directory: ${options.releaseDirectory}`);
  }
  const checksums = parseChecksumManifest(resolve(options.releaseDirectory, "SHA256SUMS"));
  if (checksums.size === 0) {
    throw new Error("SHA256SUMS must contain at least one release artifact");
  }

  const primaryArtifacts = [];
  for (const [fileName, expectedDigest] of checksums) {
    const filePath = resolve(options.releaseDirectory, fileName);
    requireFile(filePath, `release artifact ${fileName}`);
    if (!fileName.includes(options.version)) {
      throw new Error(`Release artifact does not contain version ${options.version}: ${fileName}`);
    }
    if (!fileName.includes(options.architecture)) {
      throw new Error(
        `Release artifact does not contain architecture ${options.architecture}: ${fileName}`,
      );
    }
    if (releaseExtensions.has(extname(fileName).toLowerCase())) {
      primaryArtifacts.push(fileName);
    }
    const actualDigest = createHash("sha256").update(readFileSync(filePath)).digest("hex");
    if (actualDigest !== expectedDigest) {
      throw new Error(`SHA-256 mismatch for ${fileName}`);
    }
  }
  if (primaryArtifacts.length === 0) {
    throw new Error("SHA256SUMS does not list a supported installer artifact");
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.scope === "source") {
    validateSourceScope(options.root);
    process.stdout.write("Artifact verification passed for Web and desktop builds.\n");
  } else if (options.scope === "release") {
    validateReleaseScope(options);
    process.stdout.write("Release artifact verification passed.\n");
  } else {
    throw new Error(`Unsupported verification scope: ${options.scope}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const ignoredDirectories = new Set([
  ".git",
  ".codex-tmp",
  ".playwright-browsers",
  ".pnpm-store",
  ".tmp",
  ".tools",
  ".turbo",
  "coverage",
  "dist",
  "gen",
  "node_modules",
  "playwright-report",
  "target",
  "test-results",
]);
const ignoredFiles = new Set([
  ".node-version",
  "pnpm-lock.yaml",
  "scripts/check-no-hardcoded-paths.mjs",
]);
const scannedExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ps1",
  ".rs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const pathPatterns = [
  {
    label: "Windows user profile path",
    expression: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/gi,
  },
  {
    label: "Windows development workspace path",
    expression: /[A-Za-z]:[\\/]+(?:codex-work|dev|projects?|workspace)[\\/]+/gi,
  },
  {
    label: "macOS user home path",
    expression: /\/Users\/[^/\s"'`]+\//g,
  },
  {
    label: "Linux user home path",
    expression: /\/home\/[^/\s"'`]+\//g,
  },
];

function parseArguments(argv) {
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--root=")) {
      root = argument.slice("--root=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { root: resolve(root) };
}

function collectFiles(directory, root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && entry.name !== "test") {
        files.push(...collectFiles(absolutePath, root));
      }
      continue;
    }
    if (!entry.isFile() || !scannedExtensions.has(extname(entry.name))) {
      continue;
    }
    const relativePath = relative(root, absolutePath).split(sep).join("/");
    if (!ignoredFiles.has(relativePath)) {
      files.push({ absolutePath, relativePath });
    }
  }
  return files;
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function findHardcodedPaths(root) {
  const findings = [];
  for (const file of collectFiles(root, root)) {
    const content = readFileSync(file.absolutePath, "utf8");
    for (const pattern of pathPatterns) {
      pattern.expression.lastIndex = 0;
      let match;
      while ((match = pattern.expression.exec(content)) !== null) {
        findings.push({
          path: file.relativePath,
          line: lineNumberAt(content, match.index),
          label: pattern.label,
          match: match[0],
        });
      }
    }
  }
  return findings;
}

try {
  const { root } = parseArguments(process.argv.slice(2));
  const findings = findHardcodedPaths(root);
  if (findings.length > 0) {
    process.stderr.write("Hard-coded user or workspace paths found:\n");
    for (const finding of findings) {
      process.stderr.write(
        `- ${finding.path}:${finding.line} [${finding.label}] ${finding.match}\n`,
      );
    }
    process.exitCode = 1;
  } else {
    process.stdout.write("No hard-coded user or workspace paths found.\n");
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

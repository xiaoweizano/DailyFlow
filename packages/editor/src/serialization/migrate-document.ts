import type { EditorDocument, TiptapJsonNode } from "../schema/editor-types.js";
import { CURRENT_EDITOR_SCHEMA_VERSION } from "../schema/schema-version.js";
import { normalizeDocument } from "./normalize-document.js";

type DocumentMigration = (document: TiptapJsonNode) => TiptapJsonNode;

const migrations: Readonly<Partial<Record<number, DocumentMigration>>> = {
  1: (document) => document,
};

function assertVersion(version: number, field: string): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

export function migrateDocument(
  document: TiptapJsonNode,
  fromVersion: number,
  toVersion = CURRENT_EDITOR_SCHEMA_VERSION,
): EditorDocument {
  assertVersion(fromVersion, "fromVersion");
  assertVersion(toVersion, "toVersion");
  if (fromVersion > toVersion) {
    throw new RangeError("Editor documents cannot be migrated to an older schema version");
  }

  let current = normalizeDocument({
    schemaVersion: fromVersion,
    doc: document,
  }).doc;

  for (let version = fromVersion; version < toVersion; version += 1) {
    const migration = migrations[version];
    if (migration !== undefined) {
      current = migration(current);
    }
  }

  return normalizeDocument({
    schemaVersion: toVersion,
    doc: current,
  });
}

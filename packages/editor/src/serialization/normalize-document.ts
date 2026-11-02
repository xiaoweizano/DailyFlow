import { isJsonObject, type JsonObject, type JsonValue } from "@dailyflow/domain";

import type { EditorDocument, TiptapJsonNode } from "../schema/editor-types.js";

function normalizeValue(value: unknown, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Editor documents only accept finite JSON numbers");
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new TypeError(`Editor documents cannot contain ${typeof value}`);
  }

  if (ancestors.has(value)) {
    throw new TypeError("Editor documents cannot contain circular values");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeValue(item, ancestors));
    }

    if (!isJsonObject(value)) {
      throw new TypeError("Editor documents only accept plain JSON objects");
    }

    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeValue(value[key], ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeDocument(input: EditorDocument): EditorDocument {
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new RangeError("Editor document schemaVersion must be a positive integer");
  }

  const normalized = normalizeValue(input.doc, new Set<object>());
  if (!isJsonObject(normalized) || typeof normalized.type !== "string") {
    throw new TypeError("Editor document root must be a Tiptap JSON node");
  }

  return {
    schemaVersion: input.schemaVersion,
    doc: normalized as TiptapJsonNode,
  };
}

export function cloneJsonObject(input: JsonObject): JsonObject {
  return normalizeValue(input, new Set<object>()) as JsonObject;
}

import { DomainRuleError } from "./errors.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ContentDocument {
  readonly schemaVersion: number;
  readonly doc: JsonObject;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainRuleError(field, `${field} must be a positive integer`);
  }

  return value;
}

export function createContentDocument(schemaVersion: number, doc: JsonObject): ContentDocument {
  parsePositiveInteger(schemaVersion, "schemaVersion");
  if (!isJsonObject(doc)) {
    throw new RangeError("ContentDocument.doc must be a JSON object");
  }

  return { schemaVersion, doc };
}

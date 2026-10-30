export type { LocalDate } from "@dailyflow/shared";
export { parseLocalDate } from "@dailyflow/shared";

import type { Clock, IdGenerator } from "./ports.js";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

declare const entityIdBrand: unique symbol;
declare const revisionBrand: unique symbol;
declare const contentHashBrand: unique symbol;
declare const utcTimestampBrand: unique symbol;

export type EntityId = string & { readonly [entityIdBrand]: "EntityId" };
export type Revision = number & { readonly [revisionBrand]: "Revision" };
export type ContentHash = string & { readonly [contentHashBrand]: "ContentHash" };
export type UtcTimestamp = string & { readonly [utcTimestampBrand]: "UtcTimestamp" };

export interface TagName {
  readonly value: string;
  readonly normalized: string;
}

export function parseEntityId(value: string): EntityId {
  if (!UUID_V7_PATTERN.test(value)) {
    throw new RangeError(`EntityId must be a canonical lowercase UUIDv7: ${value}`);
  }

  return value as EntityId;
}

export function parseRevision(value: number): Revision {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Revision must be a non-negative safe integer");
  }

  return value as Revision;
}

export function parseContentHash(value: string): ContentHash {
  if (!CONTENT_HASH_PATTERN.test(value)) {
    throw new RangeError("ContentHash must be 64 lowercase hexadecimal characters");
  }

  return value as ContentHash;
}

export function parseUtcTimestamp(value: string): UtcTimestamp {
  const instant = new Date(value);
  if (
    !UTC_TIMESTAMP_PATTERN.test(value) ||
    Number.isNaN(instant.getTime()) ||
    instant.toISOString() !== value
  ) {
    throw new RangeError(`UtcTimestamp must use canonical UTC ISO 8601: ${value}`);
  }

  return value as UtcTimestamp;
}

export function createTagName(value: string): TagName {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .normalize("NFKC");

  if (normalized.length === 0) {
    throw new RangeError("TagName cannot be empty");
  }

  return { value, normalized };
}

export function nextEntityId(ids: IdGenerator): EntityId {
  return parseEntityId(ids.nextId());
}

export function nowUtc(clock: Clock): UtcTimestamp {
  return parseUtcTimestamp(clock.nowUtc());
}

export function requireNonEmptyString(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new RangeError(`${field} cannot be empty`);
  }

  return value;
}

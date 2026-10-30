import {
  isJsonObject,
  parseEntityId,
  parseLocalDate,
  type EntityId,
  type LocalDate,
  type JsonObject,
  type JsonValue,
} from "@dailyflow/domain";
import { z } from "zod";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isJsonValue(value: unknown, ancestors: Set<object>): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((entry) => isJsonValue(entry, ancestors));
    }

    return (
      isJsonObject(value) && Object.values(value).every((entry) => isJsonValue(entry, ancestors))
    );
  } finally {
    ancestors.delete(value);
  }
}

export const EntityIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, "Must be a UUIDv7.")
  .transform<EntityId>((value) => parseEntityId(value));

export const LocalDateSchema = z
  .string()
  .refine((value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const instant = new Date(Date.UTC(year, month - 1, day));

    return (
      year >= 1 &&
      year <= 9999 &&
      instant.getUTCFullYear() === year &&
      instant.getUTCMonth() === month - 1 &&
      instant.getUTCDate() === day
    );
  }, "Must be a valid local date in YYYY-MM-DD format.")
  .transform<LocalDate>((value) => parseLocalDate(value));

export const JsonObjectSchema = z.custom<JsonObject>(
  (value) => isJsonObject(value) && isJsonValue(value, new Set<object>()),
  "Must be a JSON object.",
);

export const PositiveIntegerSchema = z.number().int().positive();

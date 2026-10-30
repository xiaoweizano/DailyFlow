import { PortError } from "@dailyflow/application";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function encodeCursor(value: Readonly<Record<string, number | string>>): string {
  return encodeBase64Url(JSON.stringify(value));
}

export function decodeCursor<T extends object>(cursor: string): T {
  try {
    const decoded: unknown = JSON.parse(decodeBase64Url(cursor));
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      throw new Error("Cursor payload must be an object");
    }

    return decoded as T;
  } catch {
    throw new PortError("VALIDATION_ERROR", {
      message: "Invalid pagination cursor",
      fields: { cursor: "Cursor is malformed or no longer supported" },
    });
  }
}

export function resolvePageSize(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new PortError("VALIDATION_ERROR", {
      message: "Invalid page size",
      fields: { limit: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}` },
    });
  }

  return limit;
}

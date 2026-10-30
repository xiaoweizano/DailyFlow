import { describe, expect, it } from "vitest";

import {
  createTagName,
  parseContentHash,
  parseEntityId,
  parseRevision,
  parseUtcTimestamp,
} from "../src/index.js";

describe("domain value objects", () => {
  it("accepts canonical UUIDv7 entity IDs and rejects other UUID versions", () => {
    expect(parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26")).toBe(
      "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
    );
    expect(() => parseEntityId("2f3a6f6e-05dc-4d8d-9a20-6b93cb7fc2d8")).toThrow("UUIDv7");
  });

  it("allows an unsaved revision of zero but rejects negative or fractional revisions", () => {
    expect(parseRevision(0)).toBe(0);
    expect(parseRevision(3)).toBe(3);
    expect(() => parseRevision(-1)).toThrow(RangeError);
    expect(() => parseRevision(1.5)).toThrow(RangeError);
  });

  it("requires a canonical lowercase SHA-256 content hash", () => {
    const hash = "37ea0eaf881513383c7946fe8d45394d83c549ade33c85475476380fe2f3490d";

    expect(parseContentHash(hash)).toBe(hash);
    expect(() => parseContentHash(hash.toUpperCase())).toThrow(RangeError);
    expect(() => parseContentHash(hash.slice(1))).toThrow(RangeError);
  });

  it("preserves tag display text while normalizing matching text", () => {
    expect(createTagName("  Ｗｅｂ   开发  ")).toEqual({
      value: "  Ｗｅｂ   开发  ",
      normalized: "web 开发",
    });
    expect(() => createTagName(" \t ")).toThrow("TagName");
  });

  it("accepts only canonical UTC timestamps without silently changing them", () => {
    expect(parseUtcTimestamp("2026-10-30T03:20:11.123Z")).toBe("2026-10-30T03:20:11.123Z");
    expect(() => parseUtcTimestamp("2026-10-30T03:20:11Z")).toThrow(RangeError);
    expect(() => parseUtcTimestamp("2026-02-30T03:20:11.123Z")).toThrow(RangeError);
  });
});

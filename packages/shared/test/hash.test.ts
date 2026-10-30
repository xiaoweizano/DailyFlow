import { describe, expect, it } from "vitest";

import { sha256Hex, stableStringify } from "../src/index.js";

describe("stableStringify", () => {
  it("sorts nested object keys while preserving array order", () => {
    const left = {
      title: "DailyFlow",
      metadata: { revision: 2, tags: ["work", "issue"] },
      blocks: [{ text: "hello", type: "paragraph" }],
    };
    const right = {
      blocks: [{ type: "paragraph", text: "hello" }],
      metadata: { tags: ["work", "issue"], revision: 2 },
      title: "DailyFlow",
    };

    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(stableStringify(left)).toBe(
      '{"blocks":[{"text":"hello","type":"paragraph"}],"metadata":{"revision":2,"tags":["work","issue"]},"title":"DailyFlow"}',
    );
  });
});

describe("sha256Hex", () => {
  it("returns a lowercase SHA-256 digest", async () => {
    await expect(sha256Hex("DailyFlow")).resolves.toBe(
      "37ea0eaf881513383c7946fe8d45394d83c549ade33c85475476380fe2f3490d",
    );
  });
});

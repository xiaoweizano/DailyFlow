import { describe, expect, it } from "vitest";

import { JsonObjectSchema } from "../src/validation.js";

describe("JsonObjectSchema", () => {
  it("rejects a top-level array even though it is valid JSON", () => {
    expect(JsonObjectSchema.safeParse(["not", "an", "object"]).success).toBe(false);
  });
});

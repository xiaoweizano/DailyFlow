import { describe, expect, it } from "vitest";

import { err, ok } from "../src/index.js";

describe("Result", () => {
  it("constructs success and failure values as discriminated unions", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
    expect(err({ code: "NOT_FOUND", entity: "Journal", id: "missing" })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", entity: "Journal", id: "missing" },
    });
  });
});

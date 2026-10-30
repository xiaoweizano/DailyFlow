import { describe, expect, it } from "vitest";

import { createUuidV7 } from "../src/index.js";

describe("createUuidV7", () => {
  it("encodes the timestamp and version/variant bits with injected inputs", () => {
    const randomBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(
      createUuidV7({
        now: () => 0x0123456789ab,
        randomBytes: (length) => {
          expect(length).toBe(10);
          return randomBytes;
        },
      }),
    ).toBe("01234567-89ab-7001-8203-040506070809");
  });

  it("rejects timestamps outside the UUIDv7 48-bit range", () => {
    expect(() =>
      createUuidV7({
        now: () => 0x1_0000_0000_0000,
        randomBytes: () => new Uint8Array(10),
      }),
    ).toThrow(RangeError);
  });

  it("rejects a random source with the wrong byte count", () => {
    expect(() =>
      createUuidV7({
        now: () => 0,
        randomBytes: () => new Uint8Array(9),
      }),
    ).toThrow(RangeError);
  });
});

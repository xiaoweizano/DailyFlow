import { describe, expect, it } from "vitest";

import { parseLocalDate, toLocalDate } from "../src/index.js";

describe("parseLocalDate", () => {
  it("accepts a real leap day", () => {
    expect(parseLocalDate("2024-02-29")).toBe("2024-02-29");
  });

  it.each(["2023-02-29", "2026-13-01", "2026-04-31", "2026-1-01", "not-a-date"])(
    "rejects invalid calendar date %s",
    (value) => {
      expect(() => parseLocalDate(value)).toThrow(RangeError);
    },
  );
});

describe("toLocalDate", () => {
  it("converts a UTC instant using the supplied IANA timezone", () => {
    expect(toLocalDate("2026-10-29T16:30:00.000Z", "Asia/Shanghai")).toBe("2026-10-30");
  });

  it("does not derive the local date by truncating the UTC string", () => {
    expect(toLocalDate("2024-03-10T07:30:00.000Z", "America/Los_Angeles")).toBe("2024-03-09");
  });

  it("rejects invalid timestamps and timezones", () => {
    expect(() => toLocalDate("not-a-timestamp", "Asia/Shanghai")).toThrow(RangeError);
    expect(() => toLocalDate("2026-10-29T16:30:00.000Z", "Invalid/Timezone")).toThrow(RangeError);
  });

  it("rejects impossible calendar timestamps instead of rolling them forward", () => {
    expect(() => toLocalDate("2024-02-31T00:00:00.000Z", "UTC")).toThrow(RangeError);
  });
});

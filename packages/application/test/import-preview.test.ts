import { describe, expect, it } from "vitest";

import {
  createImportSession,
  detectImportDate,
  normalizeImportRelativePath,
} from "../src/index.js";

import { SequenceIds, clock } from "./support.js";

describe("TXT import date detection", () => {
  it("detects a compact date in a file name", () => {
    expect(detectImportDate("202504/20250401.txt")).toMatchObject({
      kind: "resolved",
      date: "2025-04-01",
      source: "file-name",
      requiresBatchUniqueness: false,
    });
  });

  it("detects an ISO date followed by descriptive title text", () => {
    expect(detectImportDate("202504/2025-04-01 问题排查.txt")).toMatchObject({
      kind: "resolved",
      date: "2025-04-01",
      source: "file-name",
    });
  });

  it("combines a month directory with an MMDD file name", () => {
    expect(detectImportDate("202504/0402.txt")).toMatchObject({
      kind: "resolved",
      date: "2025-04-02",
      source: "month-directory",
      requiresBatchUniqueness: false,
    });
  });

  it("marks a day-only file name as requiring batch uniqueness", () => {
    expect(detectImportDate("202504/03 数据库连接问题.txt")).toMatchObject({
      kind: "resolved",
      date: "2025-04-03",
      source: "month-directory",
      requiresBatchUniqueness: true,
    });
  });

  it("rejects an invalid leap day instead of rolling it into March", () => {
    expect(detectImportDate("202502/20250229.txt")).toMatchObject({
      kind: "invalid",
      code: "DATE_INVALID",
    });
  });

  it("returns unresolved when neither the file nor its parent identifies a date", () => {
    expect(detectImportDate("notes/meeting.txt")).toMatchObject({
      kind: "unresolved",
      code: "DATE_UNRESOLVED",
    });
  });

  it("normalizes Windows separators to a safe logical relative path", () => {
    expect(normalizeImportRelativePath("202504\\2025-04-01.txt")).toBe(
      "202504/2025-04-01.txt",
    );
  });

  it.each([
    "../20250401.txt",
    "202504/../../20250401.txt",
    "/20250401.txt",
    "\\\\server\\logs\\20250401.txt",
    "C:\\logs\\20250401.txt",
    "202504/20250401.txt\0.txt",
  ])(
    "rejects path traversal or absolute path %s",
    (relativePath) => {
      expect(() => normalizeImportRelativePath(relativePath)).toThrow(RangeError);
    },
  );
});

describe("TXT import sessions", () => {
  it("starts at revision one so persistence constraints and optimistic locking agree", () => {
    const session = createImportSession(
      { rootLabel: "work-logs" },
      {
        clock,
        ids: new SequenceIds(["0198e2f4-7e33-7c70-a8b2-18c1520f9c30"]),
      },
    );

    expect(session.status).toBe("scanning");
    expect(session.revision).toBe(1);
  });
});

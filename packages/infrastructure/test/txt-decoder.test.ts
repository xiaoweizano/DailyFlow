import { describe, expect, it } from "vitest";

import { decodeTxt } from "../src/shared/import/txt-decoder.js";

const encoder = new TextEncoder();

describe("TXT decoder", () => {
  it("decodes UTF-8 BOM files without retaining the BOM", () => {
    const body = encoder.encode("每日工作记录\r\n");
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...body]);

    expect(decodeTxt(bytes)).toEqual({
      encoding: "utf8-bom",
      text: "每日工作记录\r\n",
      newlineStyle: "crlf",
    });
  });

  it("decodes strict UTF-8 and detects LF newlines", () => {
    expect(decodeTxt(encoder.encode("问题排查\n解决方案\n"))).toEqual({
      encoding: "utf8",
      text: "问题排查\n解决方案\n",
      newlineStyle: "lf",
    });
  });

  it("decodes GB18030 when the input is not valid UTF-8", () => {
    const bytes = Uint8Array.from([0xce, 0xca, 0xcc, 0xe2, 0xc5, 0xc5, 0xb2, 0xe9]);

    expect(decodeTxt(bytes)).toEqual({
      encoding: "gb18030",
      text: "问题排查",
      newlineStyle: "unknown",
    });
  });

  it("reports mixed newline styles", () => {
    expect(decodeTxt(encoder.encode("first\r\nsecond\nthird"))).toMatchObject({
      encoding: "utf8",
      newlineStyle: "mixed",
    });
  });

  it("treats an empty file as strict UTF-8 with unknown newline style", () => {
    expect(decodeTxt(new Uint8Array())).toEqual({
      encoding: "utf8",
      text: "",
      newlineStyle: "unknown",
    });
  });

  it("returns unknown without replacement text for undecodable bytes", () => {
    expect(decodeTxt(Uint8Array.from([0xff, 0xff]))).toEqual({
      encoding: "unknown",
      text: null,
      newlineStyle: "unknown",
    });
  });

  it("does not mutate the original byte array", () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]);
    const before = Uint8Array.from(bytes);

    decodeTxt(bytes);

    expect(bytes).toEqual(before);
  });
});

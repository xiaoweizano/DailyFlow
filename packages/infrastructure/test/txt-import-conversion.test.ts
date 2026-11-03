import { describe, expect, it } from "vitest";

import { TxtAnalyzer } from "../src/shared/import/txt-analyzer.js";
import { TxtDocumentConverter } from "../src/shared/import/txt-document-converter.js";

describe("TxtAnalyzer", () => {
  it("uses strict TXT decoding without mutating the captured bytes", async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62]);
    const before = Uint8Array.from(bytes);

    const analysis = await new TxtAnalyzer().analyze(bytes);

    expect(analysis).toEqual({
      encoding: "utf8-bom",
      text: "a\r\nb",
      newlineStyle: "crlf",
    });
    expect(bytes).toEqual(before);
  });
});

describe("TxtDocumentConverter", () => {
  it("converts imported Markdown into the current normalized editor document", () => {
    const content = new TxtDocumentConverter().toContent(
      "# 问题\n\n```ts\nconst answer = 42;\n```",
    );

    expect(content.schemaVersion).toBe(1);
    expect(content.doc).toMatchObject({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ text: "问题", type: "text" }],
        },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ text: "const answer = 42;", type: "text" }],
        },
      ],
    });
  });
});

import type { TiptapJsonNode } from "../src/schema/editor-types.js";
import { buildDocumentOutline } from "../src/serialization/document-outline.js";
import { describe, expect, it } from "vitest";

function heading(level: number, text: string): TiptapJsonNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function documentWith(content: readonly TiptapJsonNode[]): TiptapJsonNode {
  return { type: "doc", content: [...content] };
}

describe("buildDocumentOutline", () => {
  it("builds a stable outline from heading levels", () => {
    const outline = buildDocumentOutline(
      documentWith([heading(2, "Issue"), heading(3, "Cause"), heading(2, "Solution")]),
    );

    expect(outline).toEqual([
      { level: 2, text: "Issue", position: expect.any(Number) },
      { level: 3, text: "Cause", position: expect.any(Number) },
      { level: 2, text: "Solution", position: expect.any(Number) },
    ]);
    expect(outline.map((item) => item.position)).toEqual(
      [...outline.map((item) => item.position)].sort((left, right) => left - right),
    );
  });

  it("omits empty headings and preserves text from nested heading content", () => {
    const outline = buildDocumentOutline(
      documentWith([
        heading(1, "   "),
        {
          type: "heading",
          attrs: { level: 3 },
          content: [
            { type: "text", text: "排查 " },
            { type: "text", marks: [{ type: "bold" }], text: "步骤" },
          ],
        },
      ]),
    );

    expect(outline).toEqual([{ level: 3, text: "排查 步骤", position: expect.any(Number) }]);
  });
});

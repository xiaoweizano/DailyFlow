import { describe, expect, it } from "vitest";

import {
  createEditorSchema,
  documentFromEditorContent,
  editorContentFromDocument,
  migrateDocument,
  type TiptapJsonNode,
} from "../src/index.js";

function documentWithUnknownNode(): TiptapJsonNode {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "kept" }],
      },
      {
        type: "futureVisualization",
        attrs: { source: "keep-me" },
      },
    ],
  };
}

describe("editor schema migration", () => {
  it("preserves unknown nodes while migrating known content", () => {
    const legacy = documentWithUnknownNode();
    const migrated = migrateDocument(legacy, 1, 2);

    expect(migrated).toEqual({
      schemaVersion: 2,
      doc: legacy,
    });
    expect(migrated.doc).not.toBe(legacy);
    expect(migrated.doc.content?.[1]).not.toBe(legacy.content?.[1]);
    expect(legacy).toEqual(documentWithUnknownNode());
  });

  it("is idempotent when the document is already current", () => {
    const migrated = migrateDocument(documentWithUnknownNode(), 1, 2);
    const repeated = migrateDocument(migrated.doc, 2, 2);

    expect(repeated).toEqual(migrated);
    expect(repeated.doc).not.toBe(migrated.doc);
  });

  it("round-trips unknown blocks and inline nodes through the Tiptap schema", () => {
    const document: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "before " },
            {
              type: "futureInline",
              attrs: { opaque: [1, 2, 3] },
              content: [{ type: "text", text: "inline payload" }],
            },
          ],
        },
        {
          type: "futureVisualization",
          attrs: { source: "keep-me" },
          content: [{ type: "text", text: "block payload" }],
        },
      ],
    };

    const prepared = editorContentFromDocument(document);
    const tiptapJson = createEditorSchema().nodeFromJSON(prepared).toJSON();

    expect(tiptapJson.content?.[0]?.content?.[1]?.type).toBe("unknownInline");
    expect(tiptapJson.content?.[1]?.type).toBe("unknownBlock");
    expect(documentFromEditorContent(tiptapJson as TiptapJsonNode)).toEqual(document);
  });
});
